# Contributing to Vibe Kanban

## CI/CD Guidelines
- All pushes to `main` and `develop` branches trigger the CI/CD pipeline.
- Pull requests to `main` also trigger the pipeline.
- The pipeline includes linting, testing with coverage, building, and a simulated deployment.

## Branch Naming
- Feature branches: `feature/your-feature-name`
- Bugfix branches: `bugfix/your-bugfix-name`

## Pull Request Process
- Ensure your PR has a descriptive title and detailed description.
- All CI checks must pass before a PR can be merged.
- At least one approval from a maintainer is required.
- Test coverage must remain above 80%.
