import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { isCommandAvailable } from "../utils/commandUtils.js";
import { spawnWithPty, stripAnsi } from "../utils/ptyUtils.js";
import { createErrorLoopDetector, createSessionTimeout, STUCK_MESSAGE, TIMEOUT_MESSAGE } from "../utils/overseerUtils.js";

const OPENCODE_ERROR_PATTERN = /^Error /;

export class OpenCodeDriver implements LLMDriver {
   name: string = "OpenCode AI";
   private runningTasks = new Map<number, any>();
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
       this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const baseDir = this.getCloneDir();
      const taskDir = path.join(baseDir, `task-${task.id}`);

      if (!fs.existsSync(taskDir)) {
          fs.mkdirSync(taskDir, { recursive: true });
      }

      if (!isCommandAvailable("opencode")) {
         throw new Error("OpenCode CLI not found in PATH. Please install it: npm install -g opencode-ai");
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

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lisa-"));
      const promptFile = path.join(tmpDir, "prompt.md");
      fs.writeFileSync(promptFile, prompt, "utf-8");

      const modelFlag = (agent.model && agent.model !== "default") ? `--model ${agent.model}` : "";
      const cmd = `opencode run ${modelFlag} "$(cat '${promptFile}')"`;

      ctx.onLog(task.id, `Running: opencode run ${modelFlag || '(default model)'} in ${taskDir}`);

      const { proc, isPty } = spawnWithPty(cmd, { cwd: taskDir, env: process.env });

      const sessionTimeout = createSessionTimeout(proc, 5 * 60); // 5 minutes timeout
      const errorLoopDetector = createErrorLoopDetector(proc, OPENCODE_ERROR_PATTERN);

      let fullOutput = "";

      proc.stdout?.on("data", (data: Buffer) => {
         const raw = data.toString();
         const text = isPty ? stripAnsi(raw) : raw;
         fullOutput += text;
         errorLoopDetector.check(text);

         ctx.onLog(task.id, text);
      });

      proc.stderr?.on("data", (data: Buffer) => {
         const raw = data.toString();
         const text = isPty ? stripAnsi(raw) : raw;

         const textTrimmed = text.trim();
         if (textTrimmed) {
             ctx.onLog(task.id, `[STDERR] ${textTrimmed}`);
         }
      });

      proc.on("error", (error: any) => {
         ctx.onBugFound(task.id, error.message);
      });

      proc.on("close", (code) => {
         sessionTimeout.stop();

         try {
            fs.rmSync(tmpDir, { recursive: true, force: true });
         } catch {}

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
