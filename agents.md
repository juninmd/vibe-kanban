# AGENTS.md — Vibe Kanban

## Objetivo
Padronizar a atuação de agentes no Vibe Kanban para entregas reais, auditáveis e com foco em performance.

## Regras operacionais
1. **Pacotes e scripts:** usar sempre `pnpm`.
2. **Sem simulação silenciosa:** se CLI/ferramenta não existir, registrar erro real no log.
3. **Qualidade é inegociável:** Nunca gerar código mock. Todo código deve ser pronto para produção, robusto e devidamente testado.
4. **Mentalidade de melhoria contínua:** Sempre melhore o código que você encontrar ou receber. Refatoração e otimização fazem parte do fluxo.
5. **Interfaces nota 10:** Qualquer interface gerada deve ser amigável, altamente parametrizável e focada em performance máxima.
6. **Single source of truth:** estado de tarefas/agentes/eventos deve vir do backend.
7. **Persistência obrigatória:** configuração de execução deve viver em `vibe_config.json`.
8. **Observabilidade:** ações dos agentes precisam deixar trilha clara em eventos e logs por tarefa.

## Princípios de performance
- Reduzir trabalho repetitivo por ciclo (evitar scans e cópias profundas desnecessárias).
- Agrupar atualizações para diminuir re-renderizações e broadcasts.
- Processar apenas o que mudou sempre que possível.
- Limitar volume visual de logs/eventos no frontend para manter UI responsiva.

## Arquitetura de Orquestração (Inspirada em ComposioHQ)

Para evoluir a capacidade de entrega autônoma, o Vibe Kanban adotará padrões de orquestração avançada:

### 1. Isolamento via Workspaces
Cada tarefa deve ser executada em um ambiente isolado.
- **Git Worktrees:** Utilizar worktrees para permitir que múltiplos agentes trabalhem em features diferentes simultaneamente sem conflitos de branch no mesmo diretório.
- **Ambientes Efêmeros:** O ambiente de execução (runtime) deve ser criado sob demanda e descartado após a conclusão ou falha da tarefa.

### 2. Reatores (Event-Driven Architecture)
O sistema deve reagir a eventos externos e internos do ciclo de desenvolvimento, não apenas a comandos diretos.
- **Trigger `ci-failed`:** Se o CI falhar, um agente deve ser automaticamente despachado para corrigir o erro, analisando os logs.
- **Trigger `changes-requested`:** Comentários em PRs devem gerar novas sub-tarefas para o agente responsável.
- **Trigger `conflict-detected`:** Detecção de conflitos de merge deve acionar um agente especialista em resolução de conflitos.

### 3. Plugin Architecture
A estrutura deve permitir a troca fácil de componentes ("Batteries Included but Swappable").
- **Providers de LLM:** Interface agnóstica para OpenAI, Anthropic, Gemini, ou modelos locais (Ollama).
- **Runtimes:** Suporte plugável para execução em Docker, Sandbox seguro ou Localhost.
- **Ferramentas:** Capacidade de adicionar novas skills aos agentes (ex: acesso a banco de dados, web browsing) via configuração.

### 4. Parallel Agents
Suporte nativo para execução paralela de múltiplos agentes em tarefas distintas, coordenados pelo "Product Manager" para evitar colisão de escopo.

## Roadmap de execução por rodadas

### Rodada 1 (Atual)
- Otimizar auto-assign no backend.
- Renderização eficiente no Frontend (Map de estado, requestAnimationFrame).
- Estrutura básica de Drivers (Mock, OpenAI, OpenCode).

### Rodada 2
- Implementar **Reatores** básicos (ex: auto-fix para erros de linter).
- Introduzir atualização incremental no DOM do Kanban.
- Métricas de performance de agentes.

### Rodada 3
- Implementar **Workspaces** com Git Worktrees.
- Sistema de Plugins para Runtimes e LLMs.
- Fila de eventos robusta para orquestração paralela massiva.

## Estrutura de referência
- `src/server.ts`: orquestração backend, auto-assign, SSE, drivers.
- `src/app.ts`: UI 2D/3D, renderização, integração de estado.
- `ROADMAP.md`: visão macro das fases do produto.
