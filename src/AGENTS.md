# AGENTS.md — src/ (Backend & Core)

Este diretório contém o coração do Vibe Kanban.

## Key Files
- **`server.ts`**: Orquestrador principal. Gerencia o servidor HTTP, SSE, ciclo de `autoAssign`, lógica de criação automática do PM e drivers de LLM.
- **`app.ts`**: Ponto de entrada do Frontend. Gerencia a cena Three.js (3D) e a renderização do Kanban (2D).
- **`db.ts`**: Camada de persistência. Utiliza SQLite (better-sqlite3) e deve ser a única via de acesso a dados.
- **`types.ts`**: Definições fundamentais de `Task`, `Agent`, `State` e `LLMDriver`.

## Implementation Details
- **Auto-pilot:** O loop de auto-atribuição roda a cada 3 segundos via `setInterval` no `server.ts`.
- **SSE:** As mudanças de estado são transmitidas via Server-Sent Events para manter a UI sincronizada sem polling excessivo.
- **Memory:** Utilize `src/memory.ts` para persistir contexto temporário entre interações de um mesmo agente.

## Recommendations
- Ao modificar `server.ts`, garanta que as rotas da API em `/api` continuem consistentes com as interfaces em `types.ts`.
- Otimize a renderização no `app.ts` usando buffers e evitando recriação de objetos Three.js a cada frame.
