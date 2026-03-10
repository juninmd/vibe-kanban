import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { isCommandAvailable } from "../utils/commandUtils.js";

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

      const cmd = "opencode";
      const args = ["run"];
      if (agent.model && agent.model !== "default") {
          args.push("--model", agent.model);
      }
      args.push(prompt);

      ctx.onLog(task.id, `Running: ${cmd} run --model ${agent.model || 'default'} <prompt> in ${taskDir}`);

      // 5-minute timeout like Lisa's Session Timeout
      const SESSION_TIMEOUT_MS = 5 * 60 * 1000;
      let isTimedOut = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const child = spawn(cmd, args, { cwd: taskDir, shell: true });
      let fullOutput = "";

      timeoutHandle = setTimeout(() => {
          isTimedOut = true;
          if (child.kill && !child.killed) {
              child.kill();
              ctx.onLog(task.id, `[TIMEOUT] Process killed after exceeding ${SESSION_TIMEOUT_MS / 1000}s`);
          }
      }, SESSION_TIMEOUT_MS);

      child.stdout.on("data", (data) => {
         const text = data.toString();
         fullOutput += text;
         ctx.onLog(task.id, text);
      });

      child.stderr.on("data", (data) => {
         const msg = data.toString();
         ctx.onBugFound(task.id, msg);
      });

      child.on("error", (error: any) => {
         if (timeoutHandle) clearTimeout(timeoutHandle);
         ctx.onBugFound(task.id, error.message);
      });

      child.on("close", (code) => {
         if (timeoutHandle) clearTimeout(timeoutHandle);
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

         if (isTimedOut) {
            ctx.onLog(task.id, "Process Timed Out.");
            ctx.onBugFound(task.id, "Timeout: request took too long.");
         } else if (code === 0) {
            ctx.onLog(task.id, `Process completed. Files created: ${filesCreated}`);
            ctx.onComplete(task.id);
         } else {
            // Handle error
            ctx.onBugFound(task.id, `Process exited with code ${code}`);
         }
      });

      this.runningTasks.set(task.id, child);
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
