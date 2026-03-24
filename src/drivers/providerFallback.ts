import { Agent, LLMDriver } from "../types.js";
import {
  isCommandAvailable,
  resolveOpenCodeExecutable,
} from "../utils/commandUtils.js";
export { isEligibleForFallback as isEligibleForProviderFallback } from "../utils/fallbackUtils.js";

const TOOL_CHECKS: Record<string, () => boolean> = {
  gemini: () => isCommandAvailable("gemini"),
  opencode: () => Boolean(resolveOpenCodeExecutable()),
  copilot: () => isCommandAvailable("gh"),
  claude: () =>
    isCommandAvailable("claude") || Boolean(process.env.ANTHROPIC_API_KEY),
  openai: () => Boolean(process.env.OPENAI_API_KEY),
};

export function buildProviderChain(
  agent: Agent,
  drivers: Record<string, LLMDriver>,
): string[] {
  const custom = (process.env.VIBE_PROVIDER_FALLBACK || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const chain = [
    ...new Set([agent.tool, ...custom].filter((x): x is string => Boolean(x))),
  ]
    .filter((tool) => Object.prototype.hasOwnProperty.call(drivers, tool))
    .filter((tool) => (TOOL_CHECKS[tool] ? TOOL_CHECKS[tool]() : true));

  return chain;
}
