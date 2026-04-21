import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import { getProjectContext, extractAndWriteFiles } from "../utils/fileUtils.js";
import { logDebugBlock } from "./debugLogging.js";

const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";

export class CopilotDriver implements LLMDriver {
   name: string = "GitHub Copilot";
   private runningTasks = new Map<number, unknown>();
   private getCloneDir: () => string;

   constructor(getCloneDir?: () => string) {
      this.getCloneDir = getCloneDir ?? (() => "./clones");
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const token = process.env.GITHUB_TOKEN;
      if (!token) {
         throw new Error("GITHUB_TOKEN não encontrado. Configure-o nas Configurações do Kanban.");
      }

      const basePath = task.workDir || path.join(this.getCloneDir(), `task-${task.id}`);
      if (!fs.existsSync(basePath)) {
         fs.mkdirSync(basePath, { recursive: true });
      }

      const projectContext = getProjectContext(basePath);
      const model = agent.model || "gpt-4o";
      const prompt = [
         `[Role: ${agent.role}]`,
         `Task: ${task.title}`,
         `Description: ${task.description || "No description provided."}`,
         `Category: ${task.category} | Priority: ${task.priority}`,
         projectContext,
         "",
         "You are an autonomous coding agent. Complete the task by writing code.",
         "To create or overwrite a file, use the following format exactly:",
         "<<<FILE:filename.ext>>>",
         "file content here",
         "<<<END>>>",
         "Write the actual implementation needed to solve the task.",
      ].join("\n");

      ctx.onLog(task.id, `Starting GitHub Copilot Agent with model ${model}...`);
      logDebugBlock(ctx, task.id, "COPILOT PROMPT", prompt);

      try {
         const res = await fetch(GITHUB_MODELS_ENDPOINT, {
            method: "POST",
            headers: {
               "Content-Type": "application/json",
               "Authorization": `Bearer ${token}`,
            },
            body: JSON.stringify({
               model,
               messages: [
                  { role: "system", content: "You are an expert coding assistant. Complete coding tasks autonomously." },
                  { role: "user", content: prompt },
               ],
            }),
         });

         if (!res.ok) {
            const errText = await res.text();
            throw new Error(`GitHub Models API Error: ${res.status} ${errText}`);
         }

         const data = await res.json() as { choices?: { message?: { content?: string } }[] };
         const content = data.choices?.[0]?.message?.content || "";

         ctx.onLog(task.id, "Received response from GitHub Copilot.");
         const filesCreated = extractAndWriteFiles(content, basePath, ctx, task.id);

         if (filesCreated === 0) {
            ctx.onLog(task.id, "No files created. Response: " + content.substring(0, 200));
         } else {
            ctx.onLog(task.id, `Task completed. Files created: ${filesCreated}`);
            ctx.onComplete(task.id);
         }
      } catch (e: unknown) {
         const errorMessage = e instanceof Error ? e.message : String(e);
         ctx.onLog(task.id, `Exception: ${errorMessage}`);
         ctx.onBugFound(task.id, errorMessage);
      }
   }

   async listModels(): Promise<string[]> {
      const token = process.env.GITHUB_TOKEN;
      if (!token) return ["gpt-4o", "gpt-4o-mini"];
      try {
         const res = await fetch("https://models.inference.ai.azure.com/models", {
            headers: { "Authorization": `Bearer ${token}` },
         });
         if (!res.ok) return ["gpt-4o", "gpt-4o-mini", "gpt-4.1"];
         const data = await res.json() as { id: string }[] | { data?: { id: string }[] };
         const list = Array.isArray(data) ? data : ((data as { data?: { id: string }[] }).data ?? []);
         return list.map((m) => m.id).filter(Boolean);
      } catch (e) { // reason
         return ["gpt-4o", "gpt-4o-mini"];
      }
   }

   async interruptTask(task: Task): Promise<void> {
      this.runningTasks.delete(task.id);
   }

   getLogs(_taskId: number): string[] {
      return [];
   }
}

