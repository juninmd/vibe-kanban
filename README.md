# Vibe Kanban — MVP inicial

Protótipo inicial de uma sala de orquestração com:

- **Visão 3D** com agentes (bonecos) e cenário básico (kanban + computadores).
- **Visão 2D full-screen** para acompanhamento do fluxo de tarefas.
- Criação de tarefas por **Product Manager** e **usuário**.
- Agentes especializados (PM, Segurança, Performance, Funcionalidades, Testes, Features).
- Priorização, interrupção e criação de novos cards de bug durante execução.

## Como executar

Como o projeto é estático, basta abrir com um servidor local:

```bash
python3 -m http.server 4173
```

Depois acesse `http://localhost:4173`.

## Estrutura

- `index.html`: layout principal (painel lateral, visão 3D e kanban 2D).
- `styles.css`: estilo visual da sala, cards e avatars.
- `src/app.ts`: estado dos agentes/tarefas e renderização da UI/3D (compilado para `dist/app.js`).

## Próximos passos sugeridos

1. Persistência em banco (SQLite/Postgres).
2. Execução real de agentes via SDK do Codex/OpenCode.
3. WebSocket para atualizações em tempo real multiusuário.
4. Simulação de movimento no espaço 3D com animação por pathfinding.
5. Integração com backlog externo (GitHub/Jira/Linear).
