import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { resolveOpenCodeCommand } from "../utils/commandUtils.js";
import { stripAnsi } from "../utils/ptyUtils.js";
import { createErrorLoopDetector, createSessionTimeout, createStallDetector, STUCK_MESSAGE, TIMEOUT_MESSAGE, STALL_MESSAGE } from "../utils/overseerUtils.js";
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
   private runningTasks = new Map<number, any>();
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

      const prompt = `
[SYSTEM: AUTONOMOUS MODE]
You are an autonomous coding agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to complete the following task in this workspace.

TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || "No description provided."}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}

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

   const args = buildOpenCodeArgs(task, agent, prompt);
   const visibleArgs = args.slice(0, -1).join(" ") || "run";
   logDebugBlock(ctx, task.id, "AGENT PROMPT", prompt);
   logDebugCommand(ctx, task.id, openCode.command, [...args.slice(0, -1), "<prompt>"]);
   ctx.onLog(task.id, `[SYSTEM] OpenCode executable: ${openCode.command} (${openCode.source})`);
   ctx.onLog(task.id, `Running: ${visibleArgs} in ${taskDir}`);

   const proc = spawnOpenCode(openCode.command, args, taskDir, process.env);

      const sessionTimeout = createSessionTimeout(proc, 5 * 60); // 5 minutes timeout
      const errorLoopDetector = createErrorLoopDetector(proc, OPENCODE_ERROR_PATTERN);
      const stallDetector = createStallDetector(proc, 120); // 2 minutes stall timeout

      let fullOutput = "";

      proc.stdout?.on("data", (data: Buffer) => {
         const raw = data.toString();
         const text = stripAnsi(raw);
         fullOutput += text;
         errorLoopDetector.check(text);
         stallDetector.reset();

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

      proc.on("error", (error: any) => {
         this.runningTasks.delete(task.id);
         if (error.code === "ENOENT") {
            ctx.onBugFound(task.id, MISSING_OPENCODE_MESSAGE);
            return;
         }
         ctx.onBugFound(task.id, error.message);
      });

      proc.on("close", (code) => {
         sessionTimeout.stop();
         errorLoopDetector.stop();
         stallDetector.stop();
         this.runningTasks.delete(task.id);

         // Parse files
         const fileRegex = /<<<FILE:(.+?)>>>([\s\S]+?)<<<END>>>/g;
         let match;
         let filesCreated = 0;
         while ((match = fileRegex.exec(fullOutput)) !== null) {
            const filename = match[1].trim();
            let content = match[2];
            if (content.startsWith("\n")) content = content.substring(1);

            try {
                const filePath = path.join(taskDir, filename);
                const fileDir = path.dirname(filePath);
                if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

                fs.writeFileSync(filePath, content);
                ctx.onLog(task.id, `[FILE] Wrote ${filename}`);
                filesCreated++;
            } catch(e: any) {
                 ctx.onLog(task.id, `[ERROR] Failed to write ${filename}: ${e.message}`);
            }
         }

         if (sessionTimeout.wasTimedOut()) {
            ctx.onLog(task.id, TIMEOUT_MESSAGE);
            ctx.onBugFound(task.id, TIMEOUT_MESSAGE);
         } else if (errorLoopDetector.wasKilled()) {
            ctx.onLog(task.id, STUCK_MESSAGE);
            ctx.onBugFound(task.id, STUCK_MESSAGE);
         } else if (stallDetector.wasKilled()) {
            ctx.onLog(task.id, STALL_MESSAGE);
            ctx.onBugFound(task.id, STALL_MESSAGE);
         } else if (code === 0) {
            ctx.onLog(task.id, `Process completed. Files created: ${filesCreated}`);
            ctx.onComplete(task.id);
         } else {
            // Handle error
            ctx.onBugFound(task.id, `Process exited with code ${code}`);
         }
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
