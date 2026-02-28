# AGENTS.md — Vibe Kanban

> [!IMPORTANT]
> **Sua missão:** Atuar como um orquestrador de tarefas autônomo. Você terá diversos agentes com diferentes especialidades e modelos de IA. Seu objetivo é garantir que as tarefas sejam executadas com a melhor qualidade possível, seguindo as diretrizes do projeto e entregando código pronto para produção.

## Setup Commands
- **Install dependencies:** `pnpm install`
- **Build project:** `pnpm build`
- **Start server:** `pnpm start`
- **Access UI:** `http://localhost:5174`

## Development Workflow
Para garantir a qualidade exigida (visto nas instruções de orquestração):

1. **Initialize Agents:** Caso necessário, ajuste o array `defaults` em `initializeDefaultAgents` (no `src/server.ts`) para os 7 agentes base: PM, Segurança, Performance, Funcionalidades, Testes, Features e Bugs.
2. **Execute Tasks:** As tarefas devem ser executadas em ambientes isolados (Workspaces/Worktrees futuramente).
3. **Verify:** Utilize `pnpm test` para validar a suite de testes (Unit, API, Orchestration, OpenCode).
4. **Pre-commit:** Garanta que testes, revisões e reflexões foram feitos antes do commit.
5. **Commit:** Envie mudanças com mensagens descritivas.

## Operational Rules (The "Vibe" Way)
1. **Sem simulação silenciosa:** Se uma ferramenta falhar, registre o erro real.
2. **Qualidade inegociável:** Nunca gere código mock. Todo código deve ser robusto e testado.
3. **Melhoria contínua:** Refatore e otimize o código que encontrar.
4. **Interfaces nota 10:** UIs amigáveis, performáticas e parametrizáveis.
5. **Single source of truth:** Estado centralizado no backend/DB.
6. **Observabilidade:** Logs claros por tarefa em `vibe_config.json` e eventos SSE.
7. **Bugs Autônomos:** Durante o desenvolvimento, se encontrar problemas ou bugs, crie novos cards no Kanban.

## Principles of Performance
- Minimizar scans e deep copies repetitivos.
- Batching de updates para reduzir re-renders (usando `requestAnimationFrame`).
- Limitar volume visual de logs para manter responsividade.

## Inspired Features & Capabilities (Jules Integration)
O agente autônomo deve operar com o conjunto total de funcionalidades capturadas nas referências:

- **Personalidades Modulares:**
    - **"Bolt" ⚡**: Focado obsessivamente em performance e otimização de codebase.
    - **"Mika" 💜**: Focada em interatividade, UI/UX e modelos Live 2D.
- **Ciclo de Vida de Tarefas (PR Flow):**
    1. **Planejamento:** Definição clara de passos antes da execução.
    2. **Execução:** Codificação real (sem mocks).
    3. **Verificação:** Execução de `npm test` / `pnpm test`.
    4. **Reflexão:** Etapa de "Recorded Learnings" após conclusão.
    5. **Review:** Geração de Pull Requests com descrição técnica detalhada.
- **Sugestões Inteligentes:** O sistema deve sugerir melhorias proativamente em categorias:
    - **Cleanup:** Remoção de código morto.
    - **Performance:** Otimização de latência.
    - **Security:** Hardening e segurança.
    - **Code Health:** Refatoração para legibilidade.
    - **Testing:** Identificação de falta de testes unitários (ex: `MediaHandler`, `ProgramsService`).
- **MCP Integrations (Model Context Protocol):** Suporte nativo para conectar com:
    - **Linear:** Sincronização de tasks e backlog.
    - **Neon/Supabase:** Gerenciamento de banco de dados serverless.
    - **Stitch:** Geração de UI e assets de design.
    - **Tinybird:** Analytics em tempo real.
    - **Context7:** Documentação sempre atualizada para o LLM.

## Architecture Guidelines
- **Frontend:** Three.js (3D) + Vanilla JS/TS (2D). Foco em `src/app.ts`.
- **Backend:** Node.js + SSE + SQLite. Foco em `src/server.ts`.
- **Drivers:** Sistema plugável de LLMs (Gemini, OpenCode, Codex). Foco em `src/drivers/`.
- **Tests:** Suite em `test/` usando `node --test`.

## References & Inspiration
- [Hubzz Demo Interface](https://demo.hubzz.com/)
- [OpenAI Codex](https://github.com/openai/codex)
- [Anomaly OpenCode](https://github.com/anomalyco/opencode)
- [Google Jules Agent](https://jules.google) (Inspirador Principal)

---
*Para instruções detalhadas de módulos específicos, veja os arquivos AGENTS.md nos subdiretórios:*
- [src/AGENTS.md](file:///d:/Solutions/pessoal/vibe-kanban/src/AGENTS.md)
- [src/drivers/AGENTS.md](file:///d:/Solutions/pessoal/vibe-kanban/src/drivers/AGENTS.md)
- [test/AGENTS.md](file:///d:/Solutions/pessoal/vibe-kanban/test/AGENTS.md)
