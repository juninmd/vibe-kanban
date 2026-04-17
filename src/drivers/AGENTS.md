# AGENTS.md — src/drivers/ (LLM Drivers)

O sistema de drivers permite que diferentes LLMs interajam com o projeto através de ferramentas externas (CLI).

## Driver System
Todos os drivers devem implementar a interface `LLMDriver` definida em `src/types.ts`:
- **`executeTask`**: Executa a lógica principal da tarefa.
- **`interruptTask`**: Envia sinal de interrupção ao processo/agente.
- **`getLogs`**: Recupera o histórico de execução da tarefa.

## Drivers Disponíveis
- **`GeminiDriver`**: Interface nativa com o Google Gemini.
- **`OpenCodeDriver`**: Executa tarefas via `opencode` CLI.
- **`CopilotDriver`**: Interface com o GitHub Copilot CLI.
- **`ClaudeDriver`**: Interface com o Claude Code CLI.
- **`OpenAIDriver`**: Interface direta com a API da OpenAI.
- **`CodexDriver`**: Integrates with Codex-based LLMs bridging the driver ecosystem.
- **`CommandDriver`**: Driver genérico para execução de comandos shell.

## Recommendations
- Novos drivers devem ser registrados no objeto `drivers` dentro de `src/server.ts`.
- Priorize o uso de `exec` ou `spawn` com streams para que os logs sejam transmitidos em tempo real via SSE.
- Trate erros de "CLI não encontrado" graciosamente, registrando um evento informativo via `addEvent`.
