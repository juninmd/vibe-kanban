import { Agent, LLMDriver } from "../types.js";
import { isCommandAvailable } from "../utils/commandUtils.js";

const ELIGIBLE_ERROR_PATTERNS = [
  /429/i,
  /quota/i,
  /rate.?limit/i,
  /too many requests/i,
  /resource.?exhausted/i,
  /overloaded/i,
  /unavailable/i,
  /ETIMEDOUT/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /network.?error/i,
  /timeout/i,
  /not installed/i,
  /not in PATH/i,
  /command not found/i,
];

const TOOL_CHECKS: Record<string, () => boolean> = {
  gemini: () => isCommandAvailable("gemini"),
  opencode: () => isCommandAvailable("opencode"),
  copilot: () => isCommandAvailable("gh"),
  claude: () => isCommandAvailable("claude") || Boolean(process.env.ANTHROPIC_API_KEY),
  openai: () => Boolean(process.env.OPENAI_API_KEY),
};


export function isEligibleForProviderFallback(message: string): boolean {
  return ELIGIBLE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function buildProviderChain(agent: Agent, drivers: Record<string, LLMDriver>): string[] {
  const custom = (process.env.VIBE_PROVIDER_FALLBACK || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const candidates: string[] = [];
  if (agent.tool) candidates.push(agent.tool);
  custom.forEach(c => { if (c) candidates.push(c); });

  const chain = [...new Set(candidates)]
    .filter((tool) => Boolean(tool) && Object.prototype.hasOwnProperty.call(drivers, tool))
    .filter((tool) => (TOOL_CHECKS[tool] ? TOOL_CHECKS[tool]() : true));

  return chain;
}
