import requests
from typing import Dict, Any, List, Optional

class VibeKanban:
    """
    Python SDK for interacting with Vibe Kanban.
    Inspired by Codegen's Python SDK for triggering agents.
    """

    def __init__(self, base_url: str = "http://localhost:5174", api_secret: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        if api_secret:
            self.session.headers.update({"Authorization": f"Bearer {api_secret}"})

    def get_tasks(self) -> List[Dict[str, Any]]:
        """Retrieve all tasks from the Kanban board."""
        response = self.session.get(f"{self.base_url}/api/state")
        response.raise_for_status()
        return response.json().get("tasks", [])

    def create_task(self, title: str, description: str = "", category: str = "feature", priority: str = "media") -> Dict[str, Any]:
        """Create a new task."""
        data = {
            "title": title,
            "description": description,
            "category": category,
            "priority": priority,
            "source": "api"
        }
        response = self.session.post(f"{self.base_url}/api/tasks", json=data)
        response.raise_for_status()
        return response.json().get("task", {})

    def assign_task(self, task_id: int, agent_id: Optional[str] = None) -> Dict[str, Any]:
        """Assign a task to an AI agent (or auto-assign if agent_id is None)."""
        data = {"taskId": task_id}
        if agent_id:
            data["agentId"] = agent_id
        response = self.session.post(f"{self.base_url}/api/assign", json=data)
        response.raise_for_status()
        return response.json()

    def get_agents(self) -> List[Dict[str, Any]]:
        """Retrieve all AI agents in the system."""
        response = self.session.get(f"{self.base_url}/api/state")
        response.raise_for_status()
        return response.json().get("agents", [])
