import { Task, Agent } from "../types.js";

export function buildSystemPrompt(task: Task, agent: Agent, allTasks: Task[] = []): string {
    let lineageContext = "";

    if (task.groupId) {
        const siblings = allTasks.filter(t => t.groupId === task.groupId && t.id !== task.id);
        if (siblings.length > 0) {
            lineageContext = `\n## Parallel Work (Lineage Context)\nThe following sibling tasks may be running concurrently or have been completed. Do NOT duplicate their work:\n`;
            siblings.forEach(sibling => {
                lineageContext += `- [Task #${sibling.id}] ${sibling.title} (Status: ${sibling.lane})\n`;
            });
            lineageContext += "\n";
        }
    }

    return `
[SYSTEM: AUTONOMOUS MODE]
You are an autonomous coding agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to complete the following task in this workspace.

TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || "No description provided."}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}
${lineageContext}
INSTRUCTIONS:
1. Explore the codebase if necessary.
2. Implement the requested changes.
3. Run tests or checks when appropriate.
4. When finished, provide a brief summary of what you did.

If you don't have tool access, use this format to create/update files:
<<<FILE:filename.ext>>>
content
<<<END>>>
`;
}
