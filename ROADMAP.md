# Roadmap: Vibe Kanban - Do Protótipo à Produção 🚀

Este roadmap detalha a evolução do Vibe Kanban, consolidando as fases de fidelidade visual, inteligência profunda e robustez operacional.

## Fase 1: Fundação e "Alive" (Concluído ✅)
**Objetivo:** Criar um sistema responsivo e autônomo.
- [x] **Auto-Pilot Mode:** Agente PM atribui tarefas automaticamente do backlog.
- [x] **Persistência de Dados:** Implementação de SQLite para tarefas, agentes e eventos.
- [x] **Comunicação Real-time:** Migração para Server-Sent Events (SSE).
- [x] **Gestão de Pacotes:** Padronização com `pnpm`.

## Fase 2: Fidelidade Visual e Interatividade (Em Andamento 🛠️)
**Objetivo:** Melhorar a estética e a experiência imersiva na sala 3D.
- [ ] **Agent Personalities:** Trilhas visuais e cores únicas por papel (Segurança = Escudo Vermelho, Performance = Raio Azul).
- [ ] **Pathfinding 3D:** Implementar NavMesh para que os agentes desviem de obstáculos ao caminhar.
- [ ] **Terminal Integrado (UI):** Adicionar `xterm.js` para visualização real de logs ANSI nos cards.
- [ ] **Iluminação Dinâmica:** Luzes que reagem à atividade do sistema (brilho intenso durante picos de trabalho).

## Fase 3: Inteligência Profunda e Segurança (Próximos Passos 🧠)
**Objetivo:** Dar agência real e isolamento aos agentes.
- [ ] **Sandbox de Execução:** Isolar a execução de comandos dos agentes em containers **Docker** efêmeros.
- [ ] **Memória de Contexto (RAG):** Banco de vetores para os agentes consultarem soluções de bugs e padrões de código anteriores.
- [ ] **Protocolo MCP:** Transformar drivers em servidores MCP para integração padronizada com ferramentas externas (GitHub, Slack).
- [ ] **Multimodalidade:** Agentes "olham" para screenshots de bugs de UI para sugerir correções.

## Fase 4: Escala e Confiabilidade (Produção 🏭)
**Objetivo:** Estabilidade total para uso em times reais.
- [ ] **ORM & Migrações:** Migrar para Prisma ou Drizzle para gestão profissional do schema do banco.
- [ ] **WebSockets (Socket.io):** Substituir SSE por comunicação bidirecional completa.
- [ ] **Self-Correction Loop:** Agentes validam o próprio trabalho rodando testes e corrigindo falhas automaticamente.
- [ ] **Dashboard de Métricas:** Painel de MTTR, throughput e custo de tokens por tarefa.

---

*Nota: Este roadmap é dinâmico e evolui conforme novas necessidades de orquestração surgem.*
