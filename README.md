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
- `src/drivers/`: implementações dos drivers de LLM (OpenCode, Copilot, Gemini, OpenAI, Claude, Command).

## Drivers LLM (sem stubs/mocks)

O projeto suporta a execução de comandos via drivers **sempre usando integrações reais** (CLIs ou APIs oficiais), nunca stubs ou mocks:
- **OpenCodeDriver**: Executa `opencode` via CLI e materializa arquivos a partir do output.
- **CopilotDriver**: Executa `gh copilot` via CLI para obter sugestões de código reais.
- **GeminiDriver**: Usa a Gemini CLI (`gemini`) para operar diretamente sobre o workspace/clones.
- **OpenAIDriver**: Chama a API HTTP oficial da OpenAI para gerar código e arquivos.
- **ClaudeDriver**: Integra com a CLI/SDK oficial da Anthropic (quando configurada).
- **CommandDriver**: Driver genérico para orquestrar CLIs como `opencode`, `gemini`, `claude` e outros em modo sandbox.

> Regra: este projeto não deve introduzir drivers fictícios (MockDriver, stubs, fakes etc.). Se a CLI/API não estiver instalada ou configurada, o comportamento esperado é falhar de forma explícita ou pular os testes, nunca simular a ferramenta.

## Gestão de demandas remotas (SaaS)

Novos endpoints para acelerar operação como plataforma SaaS:

- `GET /api/tooling/landscape`: inventário automático de CLIs/APIs detectadas, modelos disponíveis e status de integração GitHub/GitLab.
- `POST /api/demands/intake`: enriquece uma demanda com plano de execução remoto, requisitos de negócio e critérios de aceite para PR/MR.

Exemplo rápido:

```bash
curl -X POST http://localhost:5174/api/demands/intake \
  -H 'Content-Type: application/json' \
  -d '{"title":"Escalar operação multi-tenant","description":"Entregas com foco em segurança","repoUrl":"https://gitlab.com/acme/platform"}'
```

## Próximos passos sugeridos

1. [x] Persistência em banco (SQLite).
2. [x] Limpeza de tarefas concluídas.
3. [x] Execução real de agentes via CLIs/SDKs (sem drivers de simulação).
4. WebSocket para atualizações em tempo real multiusuário (atualmente usa SSE).
5. Simulação de movimento no espaço 3D com animação por pathfinding (atualmente interpolação simples).
6. Integração com backlog externo (GitHub/Jira/Linear).
