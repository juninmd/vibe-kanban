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
  // Look only at the end of the output (last 1000 characters) to prevent ReDoS on massive logs
  const tailOutput = output.length > 1000 ? output.slice(-1000) : output;
  const exitMatch = tailOutput.match(/code\s+(\d+)|código\s+(\d+)|erro\s+(\d+)|status\s+(\d+)/i);
  if (exitMatch) {
    const codeStr = exitMatch[1] || exitMatch[2] || exitMatch[3] || exitMatch[4];
    if (codeStr && parseInt(codeStr, 10) > 128) {
      return true;
    }
  }

  return false;
}
