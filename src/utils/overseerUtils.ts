import type { ChildProcess } from "node:child_process";

export const STUCK_MESSAGE = "Provider killed: no git changes detected within the stuck threshold. Eligible for fallback.";
export const TIMEOUT_MESSAGE = "Provider killed: exceeded session_timeout. Eligible for fallback.";
export const STALL_MESSAGE = "[lisa-stall] Provider killed: no output received within the stall timeout. Eligible for fallback.";

export interface OutputStallHandle {
	reset(): void;
	wasKilled(): boolean;
	stop(): void;
}

const DEFAULT_OUTPUT_STALL_TIMEOUT = 120;

/**
 * Monitors provider stdout for prolonged silence. Kills the process if no
 * output is received within `timeoutSeconds`. Each call to `reset()` restarts
 * the countdown — call it from the stdout data handler.
 *
 * Returns a no-op handle when timeoutSeconds is 0 or undefined (disabled).
 */
export function createStallDetector(
	proc: ChildProcess,
	timeoutSeconds?: number,
): OutputStallHandle {
	const timeout = timeoutSeconds ?? DEFAULT_OUTPUT_STALL_TIMEOUT;
	if (timeout <= 0) {
		return { reset() {}, wasKilled: () => false, stop() {} };
	}

    let killed = false;
	let timer: ReturnType<typeof setTimeout> | null;

	const startTimer = () => {
		timer = setTimeout(() => {
			killed = true;
			proc.kill("SIGTERM");
		}, timeout * 1000);
	};

	startTimer();

	return {
		reset() {
			if (killed || !timer) return;
			clearTimeout(timer);
			startTimer();
		},
		wasKilled() {
			return killed;
		},
		stop() {
			if (timer) {
				clearTimeout(timer);
				timer = null;
			}
		},
	};
}

export interface ErrorLoopDetectorHandle {
	check(text: string): void;
	wasKilled(): boolean;
	stop(): void;
}

/**
 * Monitors provider output for consecutive error lines. Kills the process and
 * marks it eligible for fallback if `threshold` consecutive lines matching
 * `pattern` appear without any productive output in between.
 *
 * Use a provider-specific pattern when known (e.g. Gemini's "Error executing tool"),
 * or the generic /^Error / as a conservative fallback for other providers.
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
						proc.kill("SIGTERM");
						return;
					}
				} else {
					consecutive = 0;
				}
			}
		},
		wasKilled() {
			return killed;
		},
		stop() {},
	};
}

export interface SessionTimeoutHandle {
	stop(): void;
	wasTimedOut(): boolean;
}

/**
 * Creates a session-level timeout that kills the provider process after the
 * configured number of seconds. Returns a no-op handle when timeoutSeconds
 * is 0 or undefined (disabled by default — the user must opt in).
 */
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
		proc.kill("SIGTERM");
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
