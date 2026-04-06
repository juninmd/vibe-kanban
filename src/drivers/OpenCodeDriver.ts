import { buildSystemPrompt } from "../utils/promptUtils.js";
import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveOpenCodeCommand } from "../utils/commandUtils.js";
import { stripAnsi } from "../utils/ptyUtils.js";
import { createErrorLoopDetector, createSessionTimeout, createStallDetector, handleOverseerResults, startOverseer } from "../utils/overseerUtils.js";
import { DB } from "../db.js";
import { extractAndWriteFiles } from "../utils/fileUtils.js";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";

const OPENCODE_ERROR_PATTERN = /^Error /;
const MISSING_OPENCODE_MESSAGE = "OpenCode CLI not found. Set OPENCODE_PATH, add opencodePath to vibe_config.json, or install opencode globally in PATH.";

function shouldPassModel(model: string | undefined): boolean {
   if (!model || model === "default") {
      return false;
   }

   return /[:/]/.test(model);
}

export function buildOpenCodeArgs(task: Task, agent: Agent, prompt: string): string[] {
   const args = ["run"];

   if (task.category !== "roadmap") {
      args.push("--agent", "build");
   }
   if (shouldPassModel(agent.model)) {
      args.push("--model", agent.model);
   }

   args.push(prompt);
   return args;
}

function spawnOpenCode(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
   const stdio: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];
   const options = {
      cwd,
      env,
      stdio,
      windowsHide: true,
   };

   if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
      return spawn(process.env.comspec || "cmd.exe", ["/d", "/s", "/c", executable, ...args], options);
   }

   return spawn(executable, args, options);
}

export class OpenCodeDriver implements LLMDriver {
   name: string = "OpenCode AI";
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

      const openCode = resolveOpenCodeCommand();
      if (!openCode.command) {
         throw new Error(MISSING_OPENCODE_MESSAGE);
      }

      const siblings = task.groupId ? DB.getTasksByGroupId(task.groupId).filter(t => t.id !== task.id) : [];
      const prompt = buildSystemPrompt(task, agent, siblings);

   const args = buildOpenCodeArgs(task, agent, prompt);
   const visibleArgs = args.slice(0, -1).join(" ") || "run";
   logDebugBlock(ctx, task.id, "AGENT PROMPT", prompt);
   logDebugCommand(ctx, task.id, openCode.command, [...args.slice(0, -1), "<prompt>"]);
   ctx.onLog(task.id, `[SYSTEM] OpenCode executable: ${openCode.command} (${openCode.source})`);
   ctx.onLog(task.id, `Running: ${visibleArgs} in ${taskDir}`);

   const proc = spawnOpenCode(openCode.command, args, taskDir, process.env);

      const sessionTimeout = createSessionTimeout(proc, 5 * 60); // 5 minutes timeout
      const errorLoopDetector = createErrorLoopDetector(proc, OPENCODE_ERROR_PATTERN);
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
            ctx.onBugFound(task.id, MISSING_OPENCODE_MESSAGE);
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
