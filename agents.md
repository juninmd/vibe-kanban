# Projeto Vibe Kanban: Definições e Regras

## Objetivo do Projeto
O **Vibe Kanban** é um orquestrador de produtividade que utiliza agentes baseados em LLMs locais e remotos via CLI para executar tarefas reais de desenvolvimento, segurança e performance.

## Regras de Desenvolvimento
1. **Sem "Mocks" de Comportamento**: Os drivers não devem simular completion ou logs aleatórios. Se uma ferramenta (CLI) não estiver disponível, o erro deve ser reportado de forma clara ao usuário.
2. **Agentes Dinâmicos**: A criação de agentes deve ser feita via UI/API, permitindo a seleção de ferramentas (ex: Gemini CLI, Ollama) e modelos disponíveis no sistema do host.
3. **Persistência de Configuração**: Configurações como o diretório de clones (`cloneDir`) devem ser persistidas em `vibe_config.json`.
4. **Isolamento de Tarefas**: Cada tarefa deve ter seu próprio log de eventos e, quando aplicável, ser executada em um diretório isolado dentro da pasta de clones.
5. **Drivers Reais**:
   - `CommandDriver`: Driver principal para execução de comandos arbitrários no terminal.
   - `GeminiDriver`, `CopilotDriver`, `OpenCodeDriver`: Devem ser mantidos como estruturas de desenvolvimento para integrações específicas, mas sem lógica de simulação/mock.

## Expectativas dos Agentes
- **Autonomia**: Os agentes devem ser capazes de clonar repositórios, ler o código e sugerir alterações ou reportar bugs.
- **Transparência**: Todo output do terminal deve ser capturado e exibido no log da tarefa para que o usuário possa auditar o que o agente está fazendo.
- **Gestão de Erros**: Falhas de conexão ou ausência de ferramentas devem ser tratadas como erros de execução, não como "sucesso simulado".

## Estrutura de Pastas
- `src/drivers`: Implementações de ponte entre o servidor e as LLMs.
- `clones/`: Diretório padrão (configurável) onde os agentes realizam o trabalho.
- `dist/`: Código compilado.
