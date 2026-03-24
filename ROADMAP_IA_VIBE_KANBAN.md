# Vibe Kanban 3D — Visão do Time de Agentes

## 1. Missão do produto

Criar uma **sala 3D de operação de software** onde agentes de IA aparecem como bonecos (avatares), escolhem cards de um Kanban e executam tarefas de ponta a ponta. A experiência precisa funcionar em dois modos:

- **Modo 3D (sala imersiva):** visão espacial da operação, com agentes se movendo entre Kanban, mesas e computadores.
- **Modo 2D Fullscreen:** visão de gestão em tela cheia para acompanhamento do fluxo, prioridades e bloqueios.

A inspiração visual é o estilo da referência (`demo.hubzz.com`), com foco em legibilidade, status em tempo real e sensação de “time vivo”.

---

## 2. Time de agentes (personas + responsabilidades)

Cada agente possui:

- **Nome do papel** (ex.: Product Manager);
- **Skin com nome do modelo LLM** visível no avatar (ex.: `GPT-5.2-Codex`, `Claude`, `Gemini`, `Llama`);
- **Tags de especialidade** para filtrar e atribuir cards automaticamente.

### 2.1 Agente Product Manager

- **Responsável por:** roadmap, definição de novas features, priorização por impacto x esforço.
- **Cria cards de:** iniciativa, épicos, histórias de usuário, refinamento.
- **Pode receber tarefas de:** usuário e sistema.

### 2.2 Agente de Segurança

- **Responsável por:** vulnerabilidades, hardening, políticas de acesso, segredos, compliance.
- **Cria cards de:** correções de risco, auditorias, requisitos não-funcionais de segurança.

### 2.3 Agente de Performance

- **Responsável por:** latência, consumo de recursos, otimização de consultas/render.
- **Cria cards de:** profiling, melhoria de throughput, tuning de cache.

### 2.4 Agente de Funcionalidades (Feature Builder)

- **Responsável por:** implementação de novas funcionalidades de produto.
- **Cria cards de:** sub-tarefas técnicas quando detectar dependências.

### 2.5 Agente de Testes / QA

- **Responsável por:** testes automatizados, regressão, critérios de aceite, qualidade de release.
- **Cria cards de:** cenários faltantes, bugs encontrados, cobertura crítica.

### 2.6 Agente de Correções / Bugs

- **Responsável por:** investigação, reprodução e resolução de defeitos em produção.
- **Cria cards de:** incidentes, hotfix, pós-mortem e ações preventivas.

> Observação: como você pediu dois perfis voltados a “novas features”, dividimos em **Product Manager (estratégia e roadmap)** e **Feature Builder (execução técnica)** para evitar sobreposição.

---

## 3. Modelo de cards e taxonomia

Todo card no Kanban deve ter:

- `id`, `titulo`, `descricao`
- `origem` (`user`, `product_manager`, `agent`, `system`)
- `categoria` (`roadmap`, `security`, `performance`, `feature`, `test`, `bug`)
- `prioridade` (`P0`, `P1`, `P2`, `P3`)
- `status` (`backlog`, `todo`, `in_progress`, `review`, `done`, `blocked`)
- `owner_agent` (opcional)
- `interruption_policy` (se pode ser pausado/preemptado)
- `created_by_agent` (quando derivado de outro card)
- `links` (dependências e cards filhos)

### Regras centrais

1. **Cards podem ser criados pelo Product Manager e pelo usuário.**
2. **Qualquer agente pode criar novos cards** ao encontrar bug/bloqueio durante desenvolvimento.
3. **Cards são tagueados por categoria** para roteamento automático ao agente mais apto.
4. **Prioridade é reordenável em tempo real** sem reiniciar a sessão dos agentes.

---

## 4. Comportamento dos agentes na sala 3D

Fluxo visual esperado:

1. Agente idle observa o Kanban (estado “Aguardando tarefa”).
2. Ao ser atribuído, o agente **caminha até o quadro**, destaca o card e o “pega”.
3. O agente se move até um **computador da sala** e entra em estado “Executando”.
4. Durante execução:
   - exibe progresso;
   - publica logs resumidos;
   - atualiza checklist do card.
5. Se houver interrupção (preempção por prioridade maior), o agente:
   - salva contexto;
   - devolve o card ao estado apropriado;
   - troca para o novo card prioritário.
6. Ao concluir, agente retorna ao Kanban, move card para `review`/`done` e libera capacidade.

---

## 5. Interrupção, preempção e repriorização

Para suportar mudanças a qualquer momento:

- **Fila global de prioridade** com ordenação por `P0 > P1 > P2 > P3` + SLA.
- **Preempção segura:** tarefas com `interruption_policy=allowed` podem ser pausadas.
- **Checkpoint automático:** snapshot de contexto técnico e próximos passos.
- **Rebalanceamento:** se um agente ficar bloqueado, card pode ser realocado.

---

## 6. Experiência 2D fullscreen (modo gestão)

A visão 2D deve espelhar o estado do mundo 3D, com:

- Kanban completo em tela cheia;
- filtros por agente/categoria/prioridade;
- painel lateral com logs e eventos;
- heatmap de gargalos por coluna;
- botão de “Foco em Incidentes” (mostra apenas bugs/performance/security).

---

## 7. Arquitetura proposta

### Front-end

- **3D:** `Three.js` + `React Three Fiber` para sala, avatares e animações de navegação.
- **2D:** React com painel Kanban e timeline de eventos.
- **Sincronização:** estado compartilhado em tempo real (WebSocket).

### Back-end de orquestração

- Serviço de filas + scheduler para atribuição de cards.
- Motor de regras de prioridade/interrupção.
- Event sourcing leve para auditar mudanças de estado.

### Camada de agentes

- **OpenAI Codex (`openai/codex`):** execução técnica, geração/edição de código e automação de tarefas de desenvolvimento.
- **Anomaly OpenCode (`anomalyco/opencode`):** integração no fluxo de engenharia para produtividade e suporte operacional dos agentes.

---

## 8. Fluxo operacional fim a fim

1. Usuário ou PM cria card.
2. Orquestrador classifica categoria e prioridade.
3. Scheduler atribui ao agente correto.
4. Avatar executa ciclo visual (Kanban → computador → Kanban).
5. Se encontrar problema, agente cria card derivado (bug, dívida, bloqueio).
6. QA valida e fecha.
7. Métricas atualizam roadmap continuamente.

---

## 9. MVP sugerido (4 semanas)

### Semana 1 — Base visual e dados

- Sala 3D simples com 6 avatares e labels dos modelos.
- Kanban 2D/3D com criação manual de cards.
- Modelo de dados com categorias e prioridade.

### Semana 2 — Orquestração inicial

- Atribuição automática por categoria.
- Movimento do agente ao pegar card e ir ao computador.
- Logs de execução por card.

### Semana 3 — Interrupção e repriorização

- Preempção de cards em andamento.
- Reordenação dinâmica de backlog.
- Checkpoint e retomada de contexto.

### Semana 4 — Qualidade e demonstração

- Criação de cards derivados por bugs/bloqueios.
- Métricas básicas (lead time, WIP, throughput).
- Demo integrada 3D + 2D fullscreen.

---

## 10. Critérios de sucesso

- Cards criados por usuário e PM aparecem em tempo real.
- Agente correto é selecionado automaticamente por categoria.
- Repriorização interrompe e realoca trabalho sem perda de contexto.
- Bugs encontrados durante execução geram novos cards rastreáveis.
- Visualização 3D e 2D sempre consistentes entre si.

---

## 11. Próximo passo objetivo

Implementar o **MVP da semana 1** e validar a experiência visual com 1 cenário completo:

- criar card de feature;
- agente pegar card no Kanban;
- ir ao computador;
- atualizar status;
- concluir e refletir no modo 2D fullscreen.
