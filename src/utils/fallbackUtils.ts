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
    /ETIMEDOUT/,
    /ECONNREFUSED/,
    /ECONNRESET/,
    /ENOTFOUND/,
    /fetch failed/i,
    /\btimeout\b/i,
    /\btimed?\s*out\b/i,
    /network.?error/i,
    /not installed/i,
    /not in PATH/i,
    /command not found/i,
    /lisa-overseer/i,
    /lisa-timeout/i,
    /named models unavailable/i,
    /free plans can only use/i,
    /empty commit/i,
];

export function isEligibleForFallback(output: string): boolean {
    return ELIGIBLE_ERROR_PATTERNS.some((pattern) => pattern.test(output));
}
