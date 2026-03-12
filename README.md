# 📋 Vibe Kanban

[![Status: Active](https://img.shields.io/badge/Status-Active-brightgreen.svg)]()
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

## 🛡️ Antigravity Protocol

This project adheres to the **Antigravity** engineering standards:
- **Modular CLI**: Command logic is isolated for high testability.
- **Strict Typing**: TypeScript is enforced across all domain and integration layers.
- **150-Line Limit**: Mandatory for keeping the 3D and orchestration logic manageable.

---

*"Visualize the workflow, feel the vibe."*
