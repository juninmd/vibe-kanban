import type { ChildProcess } from "node:child_process";

export const STUCK_MESSAGE = "Provider killed: no git changes detected within the stuck threshold. Eligible for fallback.";
export const TIMEOUT_MESSAGE = "Provider killed: exceeded session_timeout. Eligible for fallback.";
export const STALL_MESSAGE = "Provider killed: output stalled. Eligible for fallback.";

export interface ErrorLoopDetectorHandle {
	check(text: string): void;
	wasKilled(): boolean;
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
				if (proc.kill) proc.kill("SIGTERM");
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
