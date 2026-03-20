import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import { getProjectContext, extractAndWriteFiles } from "../utils/fileUtils.js";

export class OpenAIDriver implements LLMDriver {
  name: string = "OpenAI API";
  private runningTasks = new Map<number, any>();
  private getCloneDir: () => string;

  constructor(getCloneDir: () => string) {
    this.getCloneDir = getCloneDir;
  }

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const basePath = path.join(this.getCloneDir(), `task-${task.id}`);
    if (!fs.existsSync(basePath)) {
      fs.mkdirSync(basePath, { recursive: true });
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY not found in environment. Please configure it in Settings.");
    }

    const projectContext = getProjectContext(basePath);

    const prompt = `
Task: ${task.title}
Description: ${task.description || "No description provided."}
Category: ${task.category}
Priority: ${task.priority}

${projectContext}

You are an autonomous coding agent. Your goal is to complete the task by writing code.
To create or overwrite a file, use the following format exactly:

<<<FILE:filename.ext>>>
file content here
<<<END>>>

Example:
<<<FILE:hello.py>>>
print("Hello World")
<<<END>>>

Do not output hypothetical logs. Output the actual file content needed to solve the task.`;

    ctx.onLog(task.id, `Starting OpenAI Agent with model ${agent.model || "gpt-4o"}...`);

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: agent.model || "gpt-4o",
          messages: [
            { role: "system", content: "You are a helpful coding assistant." },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API Error: ${res.status} ${errText}`);
      }

      const data: any = await res.json();
      const content = data.choices?.[0]?.message?.content || "";

      ctx.onLog(task.id, "Received response from OpenAI.");

      const filesCreated = extractAndWriteFiles(content, basePath, ctx, task.id);

      if (filesCreated === 0) {
        ctx.onLog(task.id, "No files were created. Response: " + content.substring(0, 200) + "...");
      } else {
        ctx.onLog(task.id, `Task completed. Files created: ${filesCreated}`);
        ctx.onComplete(task.id);
      }
    } catch (e: any) {
      ctx.onLog(task.id, `Exception: ${e.message}`);
      ctx.onBugFound(task.id, e.message);
    }
  }

  async listModels(): Promise<string[]> {
    if (!process.env.OPENAI_API_KEY) {
      return [];
    }
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      });
      if (!res.ok) {
        return [];
      }
      const data: any = await res.json();
      const models = Array.isArray(data.data) ? data.data : [];
      return models
        .map((m: any) => m.id as string)
        .filter((id) => typeof id === "string" && id.startsWith("gpt-"));
    } catch {
      return [];
    }
  }

  async interruptTask(task: Task): Promise<void> {
    this.runningTasks.delete(task.id);
    return Promise.resolve();
  }

  getLogs(taskId: number): string[] {
    return [];
  }
}
