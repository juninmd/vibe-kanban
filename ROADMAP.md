# Roadmap: Vibe Kanban - Performance + Produção 🚀

## Fase 1: Fundação e "Alive" (Concluído ✅)
**Objetivo:** sistema funcional, persistente e autônomo.
- [x] Auto-Pilot com atribuição automática.
- [x] Persistência em SQLite.
- [x] Atualização em tempo real via SSE.
- [x] Padronização com `pnpm`.

## Fase 2: Performance Estrutural (Em andamento 🛠️)
**Objetivo:** escalar fluidez com mais tarefas/agentes sem degradar UX.

### Rodada 1 (Concluída nesta entrega ✅)
- [x] Redução de custo do auto-assign (backend) com cache local de agentes por ciclo.
- [x] Remoção de cópia profunda de tarefas no frontend para detectar transições.
- [x] Batch de render via `requestAnimationFrame`.
- [x] Pré-indexação de dados no render do Kanban (tarefas por lane + agentes por id).
- [x] Limite de eventos renderizados para proteger FPS/interatividade.

### Rodada 2 (Próxima)
- [ ] Renderização incremental do Kanban (diff por card).
- [ ] Métricas de performance no dashboard (tempo de render, latência de ciclo).
- [ ] Virtualização da lista de eventos/logs.

### Rodada 3
- [ ] Auto-pilot orientado a eventos (menos polling).
- [ ] Consultas SQL focadas por lane/status + revisão de índices.
- [ ] Estratégia de backpressure para picos de eventos.

## Fase 3: Inteligência profunda e isolamento 🧠
- [ ] Sandbox de execução (Docker efêmero).
- [ ] Memória contextual (RAG) para histórico de correções.
- [ ] Integrações padronizadas via MCP.
- [ ] Fluxo multimodal para bugs visuais.

## Fase 4: Escala de produção 🏭
- [ ] ORM + migrações.
- [ ] Canal em tempo real bidirecional para colaboração intensa.
- [ ] Loop de auto-correção com execução de testes por agente.
- [ ] Métricas operacionais (MTTR, throughput, custo).
