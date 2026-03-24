import { getCommandVersion, isCommandAvailable } from "./commandUtils.js";

export interface DetectedTool {
  id: string;
  kind: "cli" | "api";
  available: boolean;
  version?: string;
  models: string[];
}

export interface VcsProviderCapability {
  provider: "github" | "gitlab";
  available: boolean;
  reason: string;
}

const STATIC_MODELS: Record<string, string[]> = {
  gemini: ["gemini-2.0-flash", "gemini-1.5-pro"],
  opencode: ["gpt-4o", "claude-sonnet-4-20250514"],
  copilot: ["gpt-4o", "gpt-4o-mini"],
  claude: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
  openai: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
};

function detectModelList(tool: string): string[] {
  const envOverride = process.env[`VIBE_${tool.toUpperCase()}_MODELS`];
  if (envOverride) {
    return envOverride
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return STATIC_MODELS[tool] || [];
}

function detectTooling(): DetectedTool[] {
  const cliTools = [
    { id: "gemini", command: "gemini" },
    { id: "opencode", command: "opencode" },
    { id: "copilot", command: "gh" },
    { id: "claude", command: "claude" },
  ];

  const cliDiscovery: DetectedTool[] = cliTools.map(({ id, command }) => {
    const available = isCommandAvailable(command);
    return {
      id,
      kind: "cli",
      available,
      version: available ? getCommandVersion(command) || undefined : undefined,
      models: detectModelList(id),
    };
  });

  const apiTools: DetectedTool[] = [
    {
      id: "openai",
      kind: "api",
      available: Boolean(process.env.OPENAI_API_KEY),
      models: detectModelList("openai"),
    },
  ];

  return [...cliDiscovery, ...apiTools];
}

function detectVcsCapabilities(): VcsProviderCapability[] {
  return [
    {
      provider: "github",
      available: isCommandAvailable("gh") || Boolean(process.env.GITHUB_TOKEN),
      reason: isCommandAvailable("gh")
        ? "GitHub CLI detectado"
        : process.env.GITHUB_TOKEN
          ? "Token GitHub configurado"
          : "Configure gh CLI ou GITHUB_TOKEN",
    },
    {
      provider: "gitlab",
      available:
        isCommandAvailable("glab") || Boolean(process.env.GITLAB_TOKEN),
      reason: isCommandAvailable("glab")
        ? "GitLab CLI detectado"
        : process.env.GITLAB_TOKEN
          ? "Token GitLab configurado"
          : "Configure glab CLI ou GITLAB_TOKEN",
    },
  ];
}

function buildBusinessRecommendations(
  tools: DetectedTool[],
  vcs: VcsProviderCapability[],
): string[] {
  const recommendations = [
    "Habilitar trilha de auditoria por tarefa para oferecer compliance enterprise no SaaS.",
    "Adicionar métricas de lead time e throughput por agente para pricing baseado em valor entregue.",
  ];

  if (!tools.some((tool) => tool.available)) {
    recommendations.push(
      "Nenhum provedor IA ativo: bloqueie criação de demanda até provisionamento mínimo de 1 modelo.",
    );
  }

  if (vcs.some((provider) => !provider.available)) {
    recommendations.push(
      "Ative integração multi-VCS (GitHub+GitLab) para aumentar conversão em contas com stack híbrida.",
    );
  }

  return recommendations;
}

export function getToolingLandscape() {
  const tools = detectTooling();
  const vcsProviders = detectVcsCapabilities();

  return {
    detectedAt: new Date().toISOString(),
    tools,
    vcsProviders,
    businessRecommendations: buildBusinessRecommendations(tools, vcsProviders),
  };
}
