# Contributing to Vibe Kanban

First off, thanks for taking the time to contribute!

## Development Workflow

1. Fork the repo and create your branch from `main`.
2. Install dependencies with `pnpm install`.
3. Make your changes and test them.
4. Issue that pull request!

## CI/CD Pipeline

Our CI/CD pipeline runs on GitHub Actions and includes:
1. **Linting**: We use ESLint and Prettier to ensure code quality.
2. **Testing**: All unit and integration tests must pass. We require at least 80% coverage.
3. **Building**: The application is built using TypeScript.
4. **Deploying**: Merges to `main` are automatically deployed to our staging environment.

## Code Quality Standards

- **TypeScript**: We use strict TypeScript settings. Avoid `any` where possible.
- **Linting**: Ensure your code passes `pnpm run lint`.
- **Formatting**: Run `pnpm run format` to match our code style.
- **Testing**: Write unit tests for new business logic.

## Commit Guidelines

We recommend writing descriptive commit messages that clearly explain the changes.
