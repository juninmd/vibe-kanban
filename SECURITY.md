# Security Policy

## Supported Versions

Currently, the master branch of Vibe Kanban is supported with security updates.

## Reporting a Vulnerability

If you discover a security vulnerability within Vibe Kanban, please do not disclose it publicly.
Instead, send an email to the repository maintainer.
Please provide detailed information about the vulnerability, including steps to reproduce it.
We will try to review and resolve the issue as quickly as possible.

## Security Practices

We follow security best practices, including:
- **Secrets Management**: Secrets and API keys are not committed to the repository. They are managed using environment variables.
- **Dependency Updates**: We use automated dependency updates (Dependabot) to keep our dependencies secure and up-to-date.
- **Dependency Scanning**: We regularly run `npm audit` or `pnpm audit` to check for known vulnerabilities in our dependencies.
- **Code Reviews**: All code changes go through pull requests and are reviewed for security implications.
- **Principle of Least Privilege**: We apply the principle of least privilege for access control.