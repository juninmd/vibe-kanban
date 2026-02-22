# AGENTS.md — Vibe Kanban

## Objetivo
Padronizar a atuação de agentes no Vibe Kanban para entregas reais, auditáveis e com foco em performance.

## Regras operacionais
1. **Pacotes e scripts:** usar sempre `pnpm`.
2. **Sem simulação silenciosa:** se CLI/ferramenta não existir, registrar erro real no log.
3. **Single source of truth:** estado de tarefas/agentes/eventos deve vir do backend.
4. **Persistência obrigatória:** configuração de execução deve viver em `vibe_config.json`.
5. **Observabilidade:** ações dos agentes precisam deixar trilha clara em eventos e logs por tarefa.

## Princípios de performance
- Reduzir trabalho repetitivo por ciclo (evitar scans e cópias profundas desnecessárias).
- Agrupar atualizações para diminuir re-renderizações e broadcasts.
- Processar apenas o que mudou sempre que possível.
- Limitar volume visual de logs/eventos no frontend para manter UI responsiva.

## Roadmap de execução por rodadas
### Rodada 1 (implementada)
- Otimizar auto-assign no backend para evitar leituras repetidas de agentes no mesmo ciclo.
- Trocar cópia profunda de tarefas no frontend por mapa leve de estado anterior.
- Fazer batch de render no frontend com `requestAnimationFrame`.
- Pré-indexar tarefas por lane e agentes por id durante renderização do Kanban.
- Limitar render de eventos para evitar degradação com histórico grande.

### Rodada 2
- Introduzir atualização incremental no DOM do Kanban (diff por card).
- Criar métricas de tempo de render e tempo de ciclo de auto-assign.
- Adicionar paginação/virtualização para listas longas de eventos.

### Rodada 3
- Mover loops internos de automação para fila orientada a eventos.
- Revisar acesso ao SQLite com índices e consultas especializadas por lane/status.
- Avaliar troca de SSE para canal bidirecional quando houver colaboração multiusuário intensa.

## Estrutura de referência
- `src/server.ts`: orquestração backend, auto-assign, SSE, drivers.
- `src/app.ts`: UI 2D/3D, renderização, integração de estado.
- `ROADMAP.md`: visão macro das fases do produto.
