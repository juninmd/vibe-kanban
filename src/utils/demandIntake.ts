export interface DemandIntakeInput {
  title: string;
  description?: string;
  repoUrl?: string;
}

function detectRepoProvider(repoUrl?: string): "github" | "gitlab" | "unknown" {
  if (!repoUrl) return "unknown";
  const normalized = repoUrl.toLowerCase();
  if (normalized.includes("github.com")) return "github";
  if (normalized.includes("gitlab.com") || normalized.includes("/gitlab"))
    return "gitlab";
  return "unknown";
}

function buildBusinessRequirements(
  title: string,
  description?: string,
): string[] {
  const normalized = `${title} ${description || ""}`.toLowerCase();

  const baseRequirements = [
    "SLA de processamento de demanda: primeira resposta em até 2 minutos.",
    "Registro de auditoria com histórico de decisões automatizadas por agente.",
    "Indicadores de negócio: custo por entrega, tempo de ciclo e taxa de retrabalho.",
  ];

  if (normalized.includes("seguran") || normalized.includes("security")) {
    baseRequirements.push(
      "Exigir evidência de scans SAST/Dependency em toda entrega de segurança.",
    );
  }

  if (normalized.includes("saas") || normalized.includes("multi-tenant")) {
    baseRequirements.push(
      "Garantir isolamento multi-tenant para dados, contexto e segredos de agentes.",
    );
  }

  if (normalized.includes("checkout") || normalized.includes("pagamento")) {
    baseRequirements.push(
      "Incluir observabilidade de funil de receita com alertas de conversão em tempo real.",
    );
  }

  return baseRequirements;
}

export function enrichDemand(input: DemandIntakeInput) {
  const provider = detectRepoProvider(input.repoUrl);
  const businessRequirements = buildBusinessRequirements(
    input.title,
    input.description,
  );

  return {
    demand: {
      title: input.title,
      description: input.description || "",
      repoUrl: input.repoUrl || null,
      provider,
    },
    executionPlan: [
      "Descobrir CLIs e modelos disponíveis no ambiente do agente.",
      "Definir squad virtual por categoria (produto, segurança, performance, QA).",
      "Executar backlog remoto com checkpoints de PR/MR e rollback assistido.",
    ],
    businessRequirements,
    acceptanceCriteria: [
      "Toda tarefa crítica deve ter PR/MR vinculado e status rastreável no kanban.",
      "Integrações GitHub/GitLab devem operar em modo idempotente para evitar duplicidade.",
      "Falhas de provedor IA devem acionar fallback automático com registro de causa-raiz.",
    ],
  };
}
