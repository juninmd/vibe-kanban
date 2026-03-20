# Contributing to Vibe Kanban

Thank you for your interest in contributing to Vibe Kanban!

## Getting Started

1. Fork the repository and clone it locally.
2. Install dependencies with `pnpm install`.
3. Create a branch for your feature or bug fix: `git checkout -b feature/my-new-feature`.

## Coding Standards

- **Formatting:** We use Prettier to format code. Run `pnpm run format` before committing.
- **Linting:** We use ESLint to catch potential errors. Run `pnpm run lint` and ensure there are no warnings or errors.
- **Testing:** New features and bug fixes should include tests. You can run all tests and generate coverage with `pnpm run test:cov`. We aim for a minimum of 80% code coverage.

## CI/CD Pipeline

Our GitHub Actions pipeline automatically runs when you open a Pull Request to the `main` or `develop` branch.
The pipeline will run:
1. Linting and formatting checks (`pnpm run lint` and `pnpm run format:check`).
2. Tests with code coverage generation (`pnpm run test:cov`).
3. Build verification (`pnpm run build`).

**Your pull request will not be merged unless all CI checks pass.**

## Submitting a Pull Request

1. Ensure all tests and linting pass locally.
2. Commit your changes with clear, descriptive commit messages.
3. Push to your fork and submit a Pull Request.
4. The CI pipeline will run automatically. If any checks fail, review the logs and update your PR.

Thank you!
