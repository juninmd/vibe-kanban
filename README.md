# Vibe Kanban — MVP inicial

Protótipo inicial de uma sala de orquestração com:

- **Visão 3D** com agentes (bonecos) e cenário básico (kanban + computadores).
- **Visão 2D full-screen** para acompanhamento do fluxo de tarefas.
- Criação de tarefas por **Product Manager** e **usuário**.
- Agentes especializados (PM, Segurança, Performance, Funcionalidades, Testes, Features).
- Priorização, interrupção e criação de novos cards de bug durante execução.
- Limpeza de tarefas concluídas para manter o quadro organizado.

## Como executar

O projeto utiliza um backend em Node.js para gerenciar o estado dos agentes e a fila de tarefas.

1. Instale as dependências (com `pnpm`):
   ```bash
   pnpm install
   ```

2. Compile o código TypeScript:
   ```bash
   pnpm build
   ```

3. Inicie o servidor:
   ```bash
   pnpm start
   ```

> Dica: para máxima compatibilidade entre Linux/macOS/Windows, prefira caminhos relativos no app (ex.: `./clones`).

4. Acesse a aplicação em `http://localhost:5174`.


## Rodando com kind (Kubernetes local)

Pré-requisitos:
- `kind`
- `kubectl`
- `docker`

1. Suba o cluster local, build da imagem e deploy:
   ```bash
   ./scripts/kind-up.sh
   ```

2. Faça o port-forward para acessar no navegador:
   ```bash
   kubectl -n vibe-kanban port-forward svc/vibe-kanban 5174:5174
   ```

3. Abra `http://localhost:5174`.

4. Para ver logs da aplicação:
   ```bash
   kubectl -n vibe-kanban logs -f deploy/vibe-kanban
   ```

5. Para remover o cluster local:
   ```bash
   ./scripts/kind-down.sh
   ```

> Observação: os manifests estão em `k8s/` e usam a imagem local `vibe-kanban:kind` com `imagePullPolicy: IfNotPresent`.

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

1. [x] Persistência em banco (SQLite).
2. [x] Limpeza de tarefas concluídas.
3. Execução real de agentes via SDK do Codex/OpenCode (instalação das CLIs no ambiente).
3. WebSocket para atualizações em tempo real multiusuário (atualmente usa SSE).
4. Simulação de movimento no espaço 3D com animação por pathfinding (atualmente interpolação simples).
5. Integração com backlog externo (GitHub/Jira/Linear).
