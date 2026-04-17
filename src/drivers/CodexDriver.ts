import { buildSystemPrompt } from "../utils/promptUtils.js";
import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getGlobalCommandPath } from "../utils/commandUtils.js";
import { startOverseer, handleOverseerResults, createSessionTimeout, createErrorLoopDetector, createStallDetector } from "../utils/overseerUtils.js";
import { extractAndWriteFiles } from "../utils/fileUtils.js";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";

const MISSING_CODEX_MESSAGE = "Codex CLI not found. Install it or add it to PATH.";

export class CodexDriver implements LLMDriver {
   name: string = "Codex Engine";
   private runningTasks = new Map<number, ChildProcess>();
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
       this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const taskDir = task.workDir || path.join(this.getCloneDir(), `task-${task.id}`);
      if (!fs.existsSync(taskDir)) fs.mkdirSync(taskDir, { recursive: true });

      const codexCommand = getGlobalCommandPath("codex") || "codex";
      const prompt = buildSystemPrompt(task, agent);
      const args = ["--prompt", prompt];
      if (agent.model) args.push("--model", agent.model);

      logDebugBlock(ctx, task.id, "AGENT PROMPT", prompt);
      logDebugCommand(ctx, task.id, codexCommand, ["--prompt", "<prompt>", ...(agent.model ? ["--model", agent.model] : [])]);
      ctx.onLog(task.id, `[SYSTEM] Codex executable: ${codexCommand}`);

      const proc = spawn(codexCommand, args, { cwd: taskDir, env: process.env, windowsHide: true });
      this.runningTasks.set(task.id, proc);

      const sessionTimeout = createSessionTimeout(proc, 300);
      const errorLoopDetector = createErrorLoopDetector(proc, /^Error /);
      const stallDetector = createStallDetector(proc, 120);
      const overseer = startOverseer(proc, taskDir, { enabled: true, check_interval: 30, stuck_threshold: 300 });

      let fullOutput = "";

      proc.stdout?.on("data", (data: Buffer) => {
         const text = data.toString();
         fullOutput += text;
         errorLoopDetector.check(text);
         stallDetector.update();
         if (/reading|analyzing|searching|grep|cat|ls|find/i.test(text)) overseer.notifyActivity();
         ctx.onLog(task.id, text.trim());
      });

      proc.stderr?.on("data", (data: Buffer) => {
         const textTrimmed = data.toString().trim();
         if (textTrimmed) ctx.onLog(task.id, `[STDERR] ${textTrimmed}`);
      });

      proc.on("error", (error: Error & { code?: string }) => {
         this.runningTasks.delete(task.id);
         ctx.onBugFound(task.id, error.code === "ENOENT" ? MISSING_CODEX_MESSAGE : error.message);
      });

      proc.on("close", (code) => {
         sessionTimeout.stop();
         stallDetector.stop();
         overseer.stop();
         this.runningTasks.delete(task.id);
         const filesCreated = extractAndWriteFiles(fullOutput, taskDir, ctx, task.id);
         handleOverseerResults(task, ctx, sessionTimeout, overseer, errorLoopDetector, stallDetector, code, filesCreated, fullOutput);
      });
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         try {
            if (child.kill && !child.killed) child.kill();
         } catch (e: unknown) {
            /*
             * Process may have already exited.
             * Safe to ignore this error.
             */
         }
         this.runningTasks.delete(task.id);
      }
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
