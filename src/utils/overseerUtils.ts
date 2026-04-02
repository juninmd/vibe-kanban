import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Grace period (ms) between SIGTERM and SIGKILL escalation. */
const SIGKILL_GRACE_MS = 10_000;

/**
 * Sends SIGTERM to a process and escalates to SIGKILL if it doesn't exit
 * within the grace period.
 */
export function killWithEscalation(proc: ChildProcess): void {
	if (proc.kill) {
		proc.kill("SIGTERM");
		const escalation = setTimeout(() => {
			try {
				proc.kill("SIGKILL");
			} catch {
				// Process may already be dead
			}
		}, SIGKILL_GRACE_MS);
		if (escalation && typeof escalation === "object" && "unref" in escalation) {
			escalation.unref();
		}
	}
}

export const STUCK_MESSAGE = "\n[lisa-overseer] Provider killed: no git changes detected within the stuck threshold. Eligible for fallback.\n";
export const TIMEOUT_MESSAGE = "\n[lisa-timeout] Provider killed: exceeded session_timeout. Eligible for fallback.\n";
export const STALL_MESSAGE = "\n[lisa-stall] Provider killed: output stalled. Eligible for fallback.\n";
export const ERROR_LOOP_MESSAGE = "\n[lisa-overseer] Provider killed: error loop detected. Eligible for fallback.\n";

export interface ErrorLoopDetectorHandle {
	check(text: string): void;
	wasKilled(): boolean;
}

/**
 * Monitors provider output for consecutive error lines. Kills the process and
 * marks it eligible for fallback if `threshold` consecutive lines matching
 * `pattern` appear without any productive output in between.
 */
export function createErrorLoopDetector(
	proc: ChildProcess,
	pattern: RegExp,
	threshold = 25,
): ErrorLoopDetectorHandle {
	let consecutive = 0;
	let killed = false;

	return {
		check(text: string) {
			if (killed) return;
			for (const line of text.split("\n")) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				if (pattern.test(trimmed)) {
					if (++consecutive >= threshold) {
						killed = true;
						killWithEscalation(proc);
						return;
					}
				} else {
					consecutive = 0;
				}
			}
		},
		wasKilled() {
			return killed;
		}
	};
}

export interface StallDetectorHandle {
	update(): void;
	stop(): void;
	wasStalled(): boolean;
}

export function createStallDetector(
	proc: ChildProcess,
	timeoutSeconds = 120, // default 2 minutes
): StallDetectorHandle {
	if (!timeoutSeconds || timeoutSeconds <= 0) {
		return { update() {}, stop() {}, wasStalled: () => false };
	}

	let stalled = false;
	let timer: NodeJS.Timeout | null = null;

	const resetTimer = () => {
		if (timer) clearTimeout(timer);
		if (stalled) return; // Already killed
		timer = setTimeout(() => {
			stalled = true;
			try {
				killWithEscalation(proc);
			} catch (e) {}
		}, timeoutSeconds * 1000);
	};

	// start initially
	resetTimer();

	return {
		update() {
			resetTimer();
		},
		stop() {
			if (timer) clearTimeout(timer);
		},
		wasStalled() {
			return stalled;
		},
	};
}

export interface SessionTimeoutHandle {
	stop(): void;
	wasTimedOut(): boolean;
}

export function createSessionTimeout(
	proc: ChildProcess,
	timeoutSeconds?: number,
): SessionTimeoutHandle {
	if (!timeoutSeconds || timeoutSeconds <= 0) {
		return { stop() {}, wasTimedOut: () => false };
	}

	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		killWithEscalation(proc);
	}, timeoutSeconds * 1000);

	return {
		stop() {
			clearTimeout(timer);
		},
		wasTimedOut() {
			return timedOut;
		},
	};
}

export interface OverseerConfig {
    enabled: boolean;
    check_interval: number;
    stuck_threshold: number;
}

export interface OverseerHandle {
	stop(): void;
	wasKilled(): boolean;
	notifyActivity?(): void;
}

export async function getGitSnapshot(cwd: string): Promise<string | null> {
	try {
		const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
			cwd,
			timeout: 10_000,
		});
		return stdout;
	} catch {
		return null;
	}
}

export function handleOverseerResults(
	task: import("../types.js").Task,
	ctx: import("../types.js").DriverContext,
	sessionTimeout: SessionTimeoutHandle,
	overseer: OverseerHandle,
	errorLoopDetector: ErrorLoopDetectorHandle,
	stallDetector: StallDetectorHandle,
	code: number | null,
	filesCreated: number,
	fullOutput: string
): void {
	if (sessionTimeout.wasTimedOut()) {
		ctx.onLog(task.id, TIMEOUT_MESSAGE);
		ctx.onBugFound(task.id, TIMEOUT_MESSAGE);
	} else if (overseer.wasKilled()) {
		ctx.onLog(task.id, STUCK_MESSAGE);
		ctx.onBugFound(task.id, STUCK_MESSAGE);
	} else if (errorLoopDetector.wasKilled()) {
		ctx.onLog(task.id, ERROR_LOOP_MESSAGE);
		ctx.onBugFound(task.id, ERROR_LOOP_MESSAGE);
	} else if (stallDetector.wasStalled()) {
		ctx.onLog(task.id, STALL_MESSAGE);
		ctx.onBugFound(task.id, STALL_MESSAGE);
	} else if (task.agentType === "plan") {
		ctx.onLog(task.id, `[SYSTEM] PLAN finalizado com código ${code}.`);
		if (code === 0) {
			ctx.onLog(task.id, `[PLAN] ${fullOutput.trim()}`);
			ctx.onComplete(task.id);
		} else {
			ctx.onBugFound(task.id, `Planejamento falhou com código ${code}`);
		}
	} else {
		if (code === 0) {
			ctx.onLog(task.id, `Process completed. Files created: ${filesCreated}`);
			ctx.onComplete(task.id);
		} else {
			ctx.onLog(task.id, `Process exited with code ${code}`);
			ctx.onBugFound(task.id, `Process exited with code ${code}`);
		}
	}
}

export function startOverseer(
	proc: ChildProcess,
	cwd: string,
	config: OverseerConfig,
	getSnapshot: (cwd: string) => Promise<string | null> = getGitSnapshot,
): OverseerHandle {
	if (!config.enabled) {
		return {
			stop() {},
			wasKilled() {
				return false;
			},
		};
	}

	let killed = false;
	let lastSnapshot: string | null | undefined;
	let lastChangeTime = Date.now();
	let timer: ReturnType<typeof setInterval> | null = null;

	const check = async () => {
		if (killed) return;

		try {
			const snapshot = await getSnapshot(cwd);

			if (lastSnapshot === undefined) {
				// First check — establish baseline and start idle timer
				lastSnapshot = snapshot;
				lastChangeTime = Date.now();
				return;
			}

			if (snapshot !== lastSnapshot) {
				// Progress detected — reset idle timer
				lastSnapshot = snapshot;
				lastChangeTime = Date.now();
				return;
			}

			// No change since last snapshot — check if stuck threshold exceeded
			const idleMs = Date.now() - lastChangeTime;
			if (idleMs >= config.stuck_threshold * 1000) {
				killed = true;
				if (timer) {
					clearInterval(timer);
					timer = null;
				}
				killWithEscalation(proc);
			}
		} catch {
			// Ignore monitoring errors — do not interrupt the provider
		}
	};

	timer = setInterval(check, config.check_interval * 1000);
	if (timer && typeof timer === "object" && "unref" in timer) {
		timer.unref();
	}

	return {
		stop() {
			if (timer) {
				clearInterval(timer);
				timer = null;
			}
		},
		wasKilled() {
			return killed;
		},
		notifyActivity() {
			lastChangeTime = Date.now();
		}
	};
}
