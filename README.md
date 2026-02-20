# Vibe Kanban — MVP inicial

Protótipo inicial de uma sala de orquestração com:

- **Visão 3D** com agentes (bonecos) e cenário básico (kanban + computadores).
- **Visão 2D full-screen** para acompanhamento do fluxo de tarefas.
- Criação de tarefas por **Product Manager** e **usuário**.
- Agentes especializados (PM, Segurança, Performance, Funcionalidades, Testes, Features).
- Priorização, interrupção e criação de novos cards de bug durante execução.

## Como executar

O projeto utiliza um backend em Node.js para gerenciar o estado dos agentes e a fila de tarefas.

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Compile o código TypeScript:
   ```bash
   npm run build
   ```

3. Inicie o servidor:
   ```bash
   npm start
   ```

4. Acesse a aplicação em `http://localhost:5174`.

## Estrutura

- `index.html`: layout principal (painel lateral, visão 3D e kanban 2D).
- `styles.css`: estilo visual da sala, cards e avatars.
- `src/server.ts`: backend Node.js que gerencia o estado (tarefas, agentes), SSE e integrações (Drivers).
- `src/app.ts`: frontend (Three.js + lógica de UI), compilado para `dist/app.js`.
- `src/drivers/`: implementações dos drivers de LLM (Mock, OpenCode, Copilot, Gemini).

## Drivers LLM

O projeto suporta a execução de comandos via drivers. Atualmente implementados:
- **MockDriver**: Simula o comportamento sem ferramentas externas.
- **OpenCodeDriver**: Tenta executar `opencode` via CLI; fallback para simulação se não instalado.
- **CopilotDriver**: Tenta executar `copilot task` via CLI; fallback para simulação.

## Próximos passos sugeridos

1. Persistência em banco (SQLite/Postgres).
2. Execução real de agentes via SDK do Codex/OpenCode (instalação das CLIs no ambiente).
3. WebSocket para atualizações em tempo real multiusuário (atualmente usa SSE).
4. Simulação de movimento no espaço 3D com animação por pathfinding (atualmente interpolação simples).
5. Integração com backlog externo (GitHub/Jira/Linear).
