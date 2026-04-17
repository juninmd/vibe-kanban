import { buildSystemPrompt } from "../utils/promptUtils.js";
import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getGlobalCommandPath } from "../utils/commandUtils.js";
import { stripAnsi } from "../utils/ptyUtils.js";
import { createErrorLoopDetector, createSessionTimeout, createStallDetector, handleOverseerResults, startOverseer } from "../utils/overseerUtils.js";
import { extractAndWriteFiles } from "../utils/fileUtils.js";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";

const CODEX_ERROR_PATTERN = /^Error /;
const MISSING_CODEX_MESSAGE = "Codex CLI not found. Install it or add it to PATH.";

export class CodexDriver implements LLMDriver {
   name: string = "Codex Engine";
   private runningTasks = new Map<number, ChildProcess>();
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
       this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const baseDir = this.getCloneDir();
      const taskDir = task.workDir || path.join(baseDir, `task-${task.id}`);

      if (!fs.existsSync(taskDir)) {
          fs.mkdirSync(taskDir, { recursive: true });
      }

      const codexCommand = getGlobalCommandPath("codex") || "codex";

      const prompt = buildSystemPrompt(task, agent);

      const args = ["--prompt", prompt];
      if (agent.model) {
          args.push("--model", agent.model);
      }

      logDebugBlock(ctx, task.id, "AGENT PROMPT", prompt);
      logDebugCommand(ctx, task.id, codexCommand, ["--prompt", "<prompt>", ...(agent.model ? ["--model", agent.model] : [])]);
      ctx.onLog(task.id, `[SYSTEM] Codex executable: ${codexCommand}`);
      ctx.onLog(task.id, `Running: codex in ${taskDir}`);

      const proc = spawn(codexCommand, args, {
          cwd: taskDir,
          env: process.env,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
      });

      const sessionTimeout = createSessionTimeout(proc, 5 * 60); // 5 minutes timeout
      const errorLoopDetector = createErrorLoopDetector(proc, CODEX_ERROR_PATTERN);
      const stallDetector = createStallDetector(proc, 120);
      const overseer = startOverseer(proc, taskDir, { enabled: true, check_interval: 30, stuck_threshold: 300 });

      let fullOutput = "";

      proc.stdout?.on("data", (data: Buffer) => {
         const raw = data.toString();
         const text = stripAnsi(raw);
         fullOutput += text;
         errorLoopDetector.check(text);
         stallDetector.update();

         if (/reading|analyzing|searching|grep|cat|ls|find/i.test(text)) {
             overseer.notifyActivity();
         }

         ctx.onLog(task.id, text);
      });

      proc.stderr?.on("data", (data: Buffer) => {
         const raw = data.toString();
         const text = stripAnsi(raw);

         const textTrimmed = text.trim();
         if (textTrimmed) {
             ctx.onLog(task.id, `[STDERR] ${textTrimmed}`);
         }
      });

      proc.on("error", (error: Error & { code?: string }) => {
         this.runningTasks.delete(task.id);
         if (error.code === "ENOENT") {
            ctx.onBugFound(task.id, MISSING_CODEX_MESSAGE);
            return;
         }
         ctx.onBugFound(task.id, error.message);
      });

      proc.on("close", (code) => {
         sessionTimeout.stop();
         stallDetector.stop();
         overseer.stop();
         this.runningTasks.delete(task.id);

         const filesCreated = extractAndWriteFiles(fullOutput, taskDir, ctx, task.id);

         handleOverseerResults(
            task, ctx,
            sessionTimeout, overseer, errorLoopDetector, stallDetector,
            code, filesCreated, fullOutput
         );
      });

      this.runningTasks.set(task.id, proc);
      return Promise.resolve();
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         try {
            if (child.kill && !child.killed) {
                child.kill();
            }
         } catch (e) {
            // Process may have already exited
         }
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
