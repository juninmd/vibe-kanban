# Contributing Guidelines

## Branch Naming Conventions

- `feature/*` for new features
- `bugfix/*` for bug fixes

## Pull Request Process

- All PRs must pass CI checks (Lint, Test, Build).
- Maintain a minimum 80% test coverage.
- Require at least one maintainer approval before merging.

## CI/CD Pipeline

- The pipeline enforces ESLint, Prettier, and TypeScript checks.
- E2E tests are run via Playwright.
- Any security vulnerabilities found via `pnpm audit` should be addressed.
