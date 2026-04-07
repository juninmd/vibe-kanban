import { buildSystemPrompt } from "../utils/promptUtils.js";
import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getProjectContext, extractAndWriteFiles } from "../utils/fileUtils.js";
import { isCommandAvailable, getGlobalCommandPath } from "../utils/commandUtils.js";
import { stripAnsi } from "../utils/ptyUtils.js";
import { createErrorLoopDetector, createSessionTimeout, createStallDetector, handleOverseerResults, startOverseer } from "../utils/overseerUtils.js";
import { execa } from "execa";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";

// Gemini-specific: these prefixes appear on every failed tool call and API error
const GEMINI_ERROR_PATTERN = /^Error (executing tool|generating content)/;

import { ChildProcess } from "child_process";

export class GeminiDriver implements LLMDriver {
   name: string = "Gemini CLI Driver";
   private runningTasks = new Map<number, ChildProcess>();
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

       // Check if Gemini is installed
       if (!isCommandAvailable("gemini")) {
          throw new Error("Gemini CLI not found in PATH. Please install it: npm install -g @google/gemini-cli");
       }

      const isPlanMode = task.agentType === "plan";

      let guardrails = "";
      if (task.lastError) {
          guardrails = `\n[GUARDRAILS]\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n${task.lastError}\nEnsure you fix the issue and do not repeat the same mistake.\n`;
      }

      // Prompts distintos para modo plan (somente leitura) e build (mutação)
      const prompt = isPlanMode
         ? `
[SYSTEM: PLAN MODE - READ ONLY]
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

Respond ONLY with the JSON object, nothing else.
`
         : `
[SYSTEM: AUTONOMOUS MODE]
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
<<<END>>>
`;

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lisa-"));
      const promptFile = path.join(tmpDir, "prompt.md");
      fs.writeFileSync(promptFile, prompt, "utf-8");

      // Pass current environment to the child process (includes GEMINI_API_KEY, etc.)
      const env = { ...process.env };

      const geminiPath = getGlobalCommandPath("gemini") || "gemini";

      // Build arguments list to avoid string-based shell execution
      const args = ["--yolo"];
      if (agent.model) {
         args.push("--model", agent.model);
      }
      args.push("-p", prompt); // Pass the prompt directly as an argument, avoids `$(cat prompt.md)`

      let fullOutput = "";

      logDebugBlock(ctx, task.id, "AGENT PROMPT", prompt);
      logDebugCommand(
         ctx,
         task.id,
         geminiPath,
         [...args.slice(0, -1), "<prompt>"],
      );
      ctx.onLog(task.id, `[SYSTEM] Iniciando Gemini CLI para Tarefa #${task.id}`);
      ctx.onLog(task.id, `[SYSTEM] Workspace: ${basePath}`);
      ctx.onLog(task.id, `[SYSTEM] Modelo: ${agent.model || "(default model)"}`);
      ctx.onLog(task.id, `[gemini] Running: gemini --yolo ${agent.model ? `--model ${agent.model}` : ""} -p <prompt>`);

      try {
         const proc = execa(geminiPath, args, {
            cwd: basePath,
            env: env,
            reject: false
         }) as unknown as ChildProcess;

         const isPty = false;

         const sessionTimeout = createSessionTimeout(proc, 5 * 60); // 5 minutes timeout
         const errorLoopDetector = createErrorLoopDetector(proc, GEMINI_ERROR_PATTERN);
         const stallDetector = createStallDetector(proc, 120);
         const overseer = startOverseer(proc, basePath, { enabled: true, check_interval: 30, stuck_threshold: 300 });

         proc.stdout?.on("data", (chunk: Buffer) => {
            const raw = chunk.toString();
            const text = isPty ? stripAnsi(raw) : raw;
            fullOutput += text;
            errorLoopDetector.check(text);
            stallDetector.update();

            // Clean up output for the terminal view
            const lines = text.split("\n");
            lines.forEach(line => {
               const trimmed = line.trim();
               if (trimmed) ctx.onLog(task.id, trimmed);
            });
         });

         proc.stderr?.on("data", (chunk: Buffer) => {
            const raw = chunk.toString();
            const text = isPty ? stripAnsi(raw) : raw;
            const textTrimmed = text.trim();
            if (textTrimmed) {
               // We log stderr but identify it
               ctx.onLog(task.id, `[STDERR] ${textTrimmed}`);
            }
         });

         proc.on("error", (error: Error & { code?: string }) => {
            if (error.code === "ENOENT") {
               ctx.onLog(task.id, "Error: Gemini CLI ('gemini') not found in PATH.");
               ctx.onBugFound(task.id, "Gemini CLI not found.");
            } else {
               ctx.onLog(task.id, `Spawn Error: ${error.message}`);
               ctx.onBugFound(task.id, error.message);
            }
         });

         proc.on("close", (code) => {
            sessionTimeout.stop();
            stallDetector.stop();
            overseer.stop();
            this.runningTasks.delete(task.id);
            try {
               fs.rmSync(tmpDir, { recursive: true, force: true });
            } catch {}

            let filesCreated = 0;
            if (!isPlanMode) {
               // Fallback: Parse files if Gemini used the text format instead of tools
               filesCreated = extractAndWriteFiles(fullOutput, basePath, ctx, task.id);
            }

            handleOverseerResults(
               task, ctx,
               sessionTimeout, overseer, errorLoopDetector, stallDetector,
               code, filesCreated, fullOutput
            );
         });

         this.runningTasks.set(task.id, proc);
      } catch (e: unknown) {
         try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
         const errorMessage = e instanceof Error ? e.message : String(e);
         ctx.onLog(task.id, `[EXCEPTION] ${errorMessage}`);
         ctx.onBugFound(task.id, errorMessage);
      }

       return Promise.resolve();
    }

   async interruptTask(task: Task): Promise<void> {
      const process = this.runningTasks.get(task.id);
      if (process) {
         try {
            if (process.kill) process.kill("SIGTERM");
         } catch (e) {
            // Process may have already exited
         }
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
