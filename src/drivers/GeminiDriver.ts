import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as path from "path";
import { getProjectContext, extractAndWriteFiles } from "../utils/fileUtils.js";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { streamText } from "ai";
import { createGeminiProvider } from "ai-sdk-provider-gemini-cli";

export class GeminiDriver implements LLMDriver {
   name: string = "Gemini CLI Driver";
   private runningTasks = new Map<number, AbortController>();
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
      this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      // Prioritize task-specific workDir, fallback to cloning pattern
      const basePath = task.workDir || path.join(this.getCloneDir(), `task-${task.id}`);
      
      if (!fs.existsSync(basePath)) {
         fs.mkdirSync(basePath, { recursive: true });
      }

      const isPlanMode = task.agentType === "plan";

      let guardrails = "";
      if (task.lastError) {
          guardrails = `\n[GUARDRAILS]\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n${task.lastError}\nEnsure you fix the issue and do not repeat the same mistake.\n`;
      }

      const projectContext = getProjectContext(basePath);

      // Prompts distintos para modo plan (somente leitura) e build (mutação)
      const systemPrompt = isPlanMode
         ? `[SYSTEM: PLAN MODE - READ ONLY]
You are an autonomous planning agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to ANALYZE the repository in this workspace and produce a high quality refactoring / implementation PLAN,
without making any file modifications yourself.

WORKSPACE: ${basePath}
TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || "No description provided."}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}
${guardrails}
RULES:
1. TREAT THE FILESYSTEM AS READ-ONLY: do NOT modify, create or delete files.
2. Do NOT call tools that write to disk or run destructive commands.
3. Focus on understanding the architecture, listing impacted modules and files, and sequencing concrete steps.
4. Your final answer MUST be a structured JSON plan with:
   {
     "highLevelSummary": string,
     "steps": [
       {
         "file": "relative/path.ts",
         "summary": "short description of the change",
         "rationale": "why this change is needed"
       }
     ]
   }
5. Keep the JSON valid and minified (no comments).

Respond ONLY with the JSON object, nothing else.`
         : `[SYSTEM: AUTONOMOUS MODE]
You are an autonomous coding agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to complete the following task in this workspace.

TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || "No description provided."}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}
${guardrails}
INSTRUCTIONS:
1. Explore the codebase if necessary.
2. Implement the requested changes.
3. Run tests or checks when appropriate.
4. When finished, provide a brief summary of what you did.

If you don't have tool access, use this format to create/update files:
<<<FILE:filename.ext>>>
content
<<<END>>>`;

      const prompt = `${systemPrompt}\n\n${projectContext}`;

      const geminiApiKey = process.env.GEMINI_API_KEY;
      const gemini = createGeminiProvider(
         geminiApiKey
            ? { authType: 'api-key', apiKey: geminiApiKey }
            : { authType: 'oauth-personal' }
      );

      const modelName = agent.model || "gemini-2.5-pro";
      const model = gemini(modelName);

      logDebugBlock(ctx, task.id, "AGENT PROMPT", prompt);
      ctx.onLog(task.id, `[SYSTEM] Iniciando Gemini Provider para Tarefa #${task.id}`);
      ctx.onLog(task.id, `[SYSTEM] Workspace: ${basePath}`);
      ctx.onLog(task.id, `[SYSTEM] Modelo: ${modelName}`);

      const abortController = new AbortController();
      this.runningTasks.set(task.id, abortController);

      try {
         const stream = await streamText({
            model,
            prompt,
            abortSignal: abortController.signal
         });

         let fullOutput = "";

         for await (const textPart of stream.textStream) {
            fullOutput += textPart;

            // Log cleaned up output chunk
            const lines = textPart.split("\\n");
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
            ctx.onLog(task.id, `[EXCEPTION] ${errorMessage}`);
            ctx.onBugFound(task.id, errorMessage);
         }
      } finally {
         this.runningTasks.delete(task.id);
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

   async listModels(): Promise<string[]> {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
         return [];
      }
      try {
         const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
         if (!res.ok) {
            return [];
         }
         const data = await res.json() as { models?: { name: string }[] };
         const models = Array.isArray(data.models) ? data.models : [];
         return models
            .map((m) => m.name)
            .filter(id => typeof id === "string" && id.length > 0);
      } catch {
         return [];
      }
   }

   getLogs(taskId: number): string[] {
      // In this architecture, logs are managed by the server's context
      return [];
   }
}
