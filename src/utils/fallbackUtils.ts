export const ELIGIBLE_ERROR_PATTERNS = [
  /429/i,
  /quota/i,
  /rate.?limit/i,
  /too many requests/i,
  /resource.?exhausted/i,
  /overloaded/i,
  /unavailable/i,
  /not.?found.*model/i,
  /model.*not.?found/i,
  /does not exist/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /fetch failed/i,
  /\btimeout\b/i,
  /\btimed?\s*out\b/i,
  /timeout/i,
  /network.?error/i,
  /not installed/i,
  /not in PATH/i,
  /command not found/i,
  /lisa-overseer/i,
  /lisa-timeout/i,
  /named models unavailable/i,
  /free plans can only use/i,
  /empty commit/i,
  // Process crash patterns (OOM, fatal errors, signals)
  /heap.*out of memory/i,
  /out of memory/i,
  /FATAL ERROR/,
  /allocation failed/i,
  /segmentation fault/i,
  /\bSIGKILL\b/,
  /\bSIGABRT\b/,
  /\bSIGSEGV\b/,
];

export function isEligibleForFallback(
  output: string,
  exitCode?: number,
): boolean {
  if (ELIGIBLE_ERROR_PATTERNS.some((pattern) => pattern.test(output)))
    return true;

  // Exit codes > 128 indicate the process was killed by a signal (e.g. OOM killer,
  // SIGSEGV, SIGABRT). These are infrastructure crashes, not task-quality failures.
  if (exitCode !== undefined && exitCode > 128) return true;

  // Check if the output explicitly says it exited with a code > 128
  const exitMatch = output.match(
    /(?:exited with code|falhou com código|encerrado com código|encerrado com erro|exited with status) (\d+)/i,
  );
  if (exitMatch && parseInt(exitMatch[1], 10) > 128) {
    return true;
  }

  return false;
}

export interface ModelAttempt {
  provider: string;
  model?: string;
  success: boolean;
  error?: string;
  duration: number;
}

/**
 * Returns true when every attempt in a fallback chain failed due to provider
 * infrastructure issues (eligible errors or binary not found), meaning no
 * provider was able to attempt the task itself. In this case the loop should
 * stop rather than reverting the issue and retrying indefinitely.
 */
export function isCompleteProviderExhaustion(
  attempts: ModelAttempt[],
): boolean {
  if (attempts.length === 0) return false;
  return attempts.every((a) => !a.success && a.error !== "Non-eligible error");
}
