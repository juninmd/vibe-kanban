// biome-ignore lint/suspicious/noControlCharactersInRegex: required for ANSI escape sequence stripping
const ANSI_REGEX = /\x1b(?:\[[0-9;?]*[a-zA-Z]|\][^\x07]*\x07|\([A-Z0-9]|[A-Z])/g;

/**
 * Strip ANSI escape sequences and normalize PTY line endings.
 * Used to clean output for logging and result collection.
 */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, "").replace(/\r\n/g, "\n").replace(/\r/g, "");
}
