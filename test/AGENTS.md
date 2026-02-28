# AGENTS.md — test/ (Quality & Verification)

Qualidade é inegociável. A suite de testes deve passar 100% antes de qualquer commit.

## Test Suites
- **Unit Tests**: `test/unit/` (lógica isolada).
- **API Tests**: `test/api.test.js` (endpoints REST).
- **Orchestration**: `test/orchestration.test.js` (fluxo de auto-assign e lifecycle de tarefas).
- **Integration**: `test/opencode_integration.test.js`.

## Running Tests
- **All Core Tests**: `pnpm test` (roda via `node --test`).
- **E2E Tests**: `pnpm test:e2e` (executa Playwright/Browsers).

## Guidelines
- **Sem mocks de banco**: Os testes utilizam uma instância real de SQLite para garantir fidelidade ao ambiente de produção.
- **Novos Testes**: Sempre adicione um teste correspondente ao implementar uma nova feature ou corrigir um bug.
- **CI/CD**: Refira-se a `.github/workflows` para ver o plano de execução oficial em nuvem.

## Troubleshooting
Se o cluster `kind` estiver up, garanta que não há conflitos de porta ao rodar testes locais que tentam subir o servidor.
