# Contributing to Vibe Kanban

First off, thank you for considering contributing to Vibe Kanban! It's people like you that make Vibe Kanban such a great tool.

## Code of Conduct
Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Development Setup
1. Fork and clone the repository.
2. Ensure you have Node.js (version 20 or higher) and `pnpm` installed.
3. Run `pnpm install` to install dependencies.
4. Set up your `.env` file based on `.env.example`.
5. Run `pnpm run build` to compile the TypeScript code.
6. Run `pnpm run start` to start the local server.

## CI/CD Pipeline Overview
This project uses GitHub Actions for its CI/CD pipeline. Every push and pull request to the `main` and `develop` branches will trigger the pipeline.
The pipeline consists of the following jobs:
- **Lint**: Runs ESLint, TypeScript Type Check, and Prettier formatting checks.
- **Test**: Builds the project, runs the unit/integration tests with coverage using `c8`, and runs E2E tests using Playwright.
- **Build**: Compiles the source code and creates a build artifact (`dist/` directory).
- **Deploy Staging**: Automatically deploys the built artifact to the staging environment upon a successful pull request merge.
- **Deploy Production**: Automatically deploys the built artifact to the production environment when code is pushed directly or merged into the `main` branch.

## Testing Expectations
All new features and bug fixes must include corresponding tests. We require a minimum of 80% code coverage.
- **Unit Tests**: Place unit tests in the `test/unit/` directory.
- **Integration Tests**: Place integration tests in the `test/` directory.
- **E2E Tests**: Place Playwright E2E tests in the `test/e2e/` directory.

You can run the full test suite locally using:
```bash
pnpm run test:all
```

## Formatting Standards
We use Prettier for code formatting and ESLint for code linting.
Before submitting a pull request, ensure your code passes the formatting and linting checks:
```bash
pnpm run format
pnpm run lint
```

## Environment Variables
The following environment variables are used in the application:
- `API_SECRET`: Secret key for API authentication.
- `PORT`: Port number for the server (default: `5174`).
- `OPENAI_API_KEY`: API key for OpenAI integrations.
- `ANTHROPIC_API_KEY`: API key for Claude integrations.
- `GEMINI_API_KEY`: API key for Gemini integrations.
- `OPENCODE_API_KEY`: API key for OpenCode integrations.

Make sure to never commit your `.env` file or any secret keys.
