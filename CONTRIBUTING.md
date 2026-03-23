# Guia de Contribuição (CI/CD)

Bem-vindo ao repositório do Vibe Kanban. Antes de submeter código, siga as seguintes instruções para garantir o alinhamento com a pipeline de CI/CD.

## Pipeline de CI/CD e Quality Gates

1. **Linting e Formatação**: O código será bloqueado se não estiver padronizado. Sempre execute localmente antes do commit:
   ```bash
   pnpm run lint
   pnpm run format
   ```

2. **Testes Obrigatórios**: Não submeta PRs sem criar os respectivos testes. Exigimos uma cobertura mínima para o código novo (e global de 80%). Rode:
   ```bash
   pnpm run test:all
   ```

3. **Verificação de Cobertura**: Para testar a cobertura de código do seu trabalho:
   ```bash
   pnpm run test:cov
   ```

4. **Regras de Pull Request**: Todo Pull Request deve vir acompanhado com uma descrição detalhada de suas alterações e ter todos os status de CI/CD no verde. O deploy só acontece nas branchs `main` ou `develop`.

## Variáveis de Ambiente e Secrets

A configuração requer as seguintes variáveis de ambiente, que nunca devem ser expostas e devem ser documentadas via `.env.example`:
- `PORT`
- `OPENAI_API_KEY` (Para agentes OpenAPI)
- `ANTHROPIC_API_KEY` (Para agentes Claude)
- `GEMINI_API_KEY` (Para agentes Gemini)
- `SNYK_TOKEN` (Necessária na pipeline CI/CD GitHub Actions).

Por favor, garanta que as secrets estejam configuradas no ambiente de testes/deploy.
