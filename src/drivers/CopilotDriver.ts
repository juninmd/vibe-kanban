import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import { getProjectContext, extractAndWriteFiles } from "../utils/fileUtils.js";
import { logDebugBlock } from "./debugLogging.js";
import { streamText } from "ai";
import { createGitHubCopilotOpenAICompatible } from "@opeoginni/github-copilot-openai-compatible";
import { buildSystemPrompt } from "../utils/promptUtils.js";

const GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com/chat/completions";

export class CopilotDriver implements LLMDriver {
   name: string = "GitHub Copilot";
   private runningTasks = new Map<number, AbortController>();
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

      const isPlanMode = task.agentType === "plan";
      const projectContext = getProjectContext(basePath);
      const systemPrompt = buildSystemPrompt(task, agent);
      const prompt = `${systemPrompt}\n\n${projectContext}`;
      const modelName = agent.model || "gpt-4o";

      ctx.onLog(task.id, `Starting GitHub Copilot Agent with model ${modelName}...`);
      logDebugBlock(ctx, task.id, "COPILOT PROMPT", prompt);

      const abortController = new AbortController();
      this.runningTasks.set(task.id, abortController);

      try {
         const copilot = createGitHubCopilotOpenAICompatible();
         const model = copilot(modelName);

         const stream = await streamText({
            model,
            prompt,
            abortSignal: abortController.signal
         });

         let fullOutput = "";

         for await (const textPart of stream.textStream) {
            fullOutput += textPart;
            const lines = textPart.split("\n");
            lines.forEach(line => {
               const trimmed = line.trim();
               if (trimmed) ctx.onLog(task.id, trimmed);
            });
         }

         let filesCreated = 0;
         if (!isPlanMode) {
            filesCreated = extractAndWriteFiles(fullOutput, basePath, ctx, task.id);
         }

         if (filesCreated === 0 && !isPlanMode) {
            ctx.onLog(task.id, "No files were created. Response: " + fullOutput.substring(0, 200) + "...");
         } else if (!isPlanMode) {
            ctx.onLog(task.id, `Task completed. Files created: ${filesCreated}`);
         }

         ctx.onComplete(task.id);
      } catch (e: unknown) {
         const errorMessage = e instanceof Error ? e.message : String(e);
         if (errorMessage.includes("AbortError")) {
            ctx.onLog(task.id, `[SYSTEM] Tarefa interrompida.`);
         } else {
            ctx.onLog(task.id, `Exception: ${errorMessage}`);
            ctx.onBugFound(task.id, errorMessage);
         }
      } finally {
         this.runningTasks.delete(task.id);
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
      } catch {
         return ["gpt-4o", "gpt-4o-mini"];
      }
   }

   async interruptTask(task: Task): Promise<void> {
      const controller = this.runningTasks.get(task.id);
      if (controller) {
         controller.abort();
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(_taskId: number): string[] {
      return [];
   }
}

