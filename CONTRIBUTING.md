# Contributing to Vibe Kanban

First off, thanks for taking the time to contribute! 🎉

## Development Process

1. **Fork & Clone**: Fork the repository and clone it to your local machine.
2. **Install Dependencies**: Run `pnpm install`
3. **Branching**: Create a branch for your work: `git checkout -b feature/your-feature-name` or `git checkout -b fix/your-bug-fix`.
4. **Code Quality**:
   - Write clear, concise, and well-documented code following SOLID principles.
   - Max file length is **180 lines of code**.
   - **Do not use mocks or fake implementations.** Use mocks **ONLY** for testing.
   - We use `eslint` and `prettier` for formatting. Run `pnpm run lint` and `pnpm run format`.
5. **Testing**:
   - Ensure comprehensive test coverage (minimum 80%).
   - Run tests with `pnpm run test:all`.
   - CI will automatically check coverage.
6. **Commit Messages**: Write descriptive commit messages.

## CI/CD Pipeline

We use GitHub Actions for our CI/CD pipeline. Every pull request will trigger a workflow that:

- Lints the codebase (`eslint`, `prettier`)
- Runs the test suite and enforces an 80% coverage threshold.
- Builds the application.
- On merge to `main`, triggers a deployment placeholder.

Your PR must pass all CI checks before it can be merged.

## Environment Variables

Check `.env.example` for the required environment variables. Never commit secrets to the repository!
