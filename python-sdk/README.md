# Vibe Kanban Python SDK

Welcome to the Vibe Kanban Python SDK! Inspired by the Codegen Python SDK, this package allows you to programmatically trigger agents, create tasks, and manage your Kanban board from your Python scripts.

## Installation

```bash
pip install requests
```
*(Note: A formal package index release is pending)*

## Usage

```python
from vibe_kanban import VibeKanban

# Initialize the client
client = VibeKanban(base_url="http://localhost:5174", api_secret="YOUR_SECRET_IF_ANY")

# List all agents
agents = client.get_agents()
print(f"Found {len(agents)} agents.")

# Create a new feature task
task = client.create_task(
    title="Optimize database queries",
    description="Analyze and improve the query performance for the tasks table.",
    category="performance",
    priority="alta"
)
print(f"Created task: {task['title']}")

# Assign the task to an AI agent
result = client.assign_task(task_id=task['id'])
print(f"Task assigned to agent: {result.get('agent', {}).get('role')}")
```

## Features

- **Trigger Agents:** Assign tasks directly via API to automatically start agent executions in isolated worktrees.
- **Manage Backlog:** Create, list, and modify tasks programmatically.
- **Monitor State:** Fetch the complete state of tasks and agents on the board.
