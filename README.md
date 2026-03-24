# 📋 Vibe Kanban

[![CI/CD Pipeline](https://github.com/juninmd/vibe-kanban/actions/workflows/ci.yml/badge.svg)](https://github.com/juninmd/vibe-kanban/actions/workflows/ci.yml)
![Status: Active](https://img.shields.io/badge/Status-Active-brightgreen.svg)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.160.0-black?logo=threedotjs)](https://threejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> A modern, high-performance Kanban board with 3D visualization, CLI integration, and built-in automation using TypeScript and SQLite.

## ✨ Features

- **3D Visualization**: Explore your tasks in an immersive 3D environment powered by Three.js.
- **CLI-First**: Powerful command-line interface (`vibe`) for rapid task management and orchestration.
- **Embedded Database**: Fast and reliable persistence with SQLite (via `better-sqlite3`).
- **Playwright Testing**: Robust E2E tests for both UI and orchestration logic.
- **Kind/K8s Ready**: Scripts included for local Kubernetes development.

## 🛠️ Tech Stack

- **Runtime**: Node.js (TypeScript)
- **Database**: SQLite
- **3D Engine**: Three.js
- **CLI Framework**: Commander.js
- **Testing**: Node.js Native Test Runner + Playwright

## 🚀 Getting Started

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test:all

# Start the server
pnpm start

# Use the CLI
node dist/cli/vibe.js --help
```

## Build and Deployment Instructions

The project is automatically built and tested on every push to `main` and `develop`.
Deployments are triggered on pushes to the `main` branch after passing CI checks.
To build locally: `pnpm build`.

## OpenCode on Windows

Set an explicit OpenCode executable path when the global `opencode` command is not available in your shell. `OPENCODE_PATH` takes priority, then `opencodePath` in `vibe_config.json`, then the normal PATH lookup.

```powershell
setx OPENCODE_PATH "c:\Users\jr_ac\AppData\Local\OpenCode\opencode-cli.exe"
```

```json
{
  "opencodePath": "C:/Users/jr_ac/AppData/Local/OpenCode/opencode-cli.exe"
}
```

To run the concrete `juninmd/cobaia` build scenario through the API, create a feature task that points at the full GitHub URL:

```powershell
curl.exe -X POST http://localhost:5174/api/tasks ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"Create hello world file\",\"category\":\"feature\",\"priority\":\"media\",\"githubRepo\":\"https://github.com/juninmd/cobaia\",\"description\":\"Create a JavaScript hello world file named hello.js that logs Hello, world!\"}"
```

Expected artifact: the task worktree for `juninmd/cobaia` should contain `hello.js` with a JavaScript hello-world log statement after OpenCode finishes.

## 🛡️ Antigravity Protocol

This project adheres to the **Antigravity** engineering standards:

- **Modular CLI**: Command logic is isolated for high testability.
- **Strict Typing**: TypeScript is enforced across all domain and integration layers.
- **150-Line Limit**: Mandatory for keeping the 3D and orchestration logic manageable.

---

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
