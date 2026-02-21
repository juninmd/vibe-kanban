import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

export class GeminiDriver implements LLMDriver {
   name: string = "Gemini CLI Driver";
   private runningTasks = new Map<number, any>();
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
      this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const basePath = this.getCloneDir();
      if (!fs.existsSync(basePath)) {
         fs.mkdirSync(basePath, { recursive: true });
      }

      const cmd = "gemini";
      // Construct a robust prompt for the agent
      const prompt = `
Task: ${task.title}
Description: ${task.description || "No description provided."}
Category: ${task.category}
Priority: ${task.priority}

Please execute this task. If you need to write code, create files, or run tests, do so in the current directory.
Provide a summary of your actions as you progress.
`;

      const args = ["-p", prompt, "-m", agent.model, "--yolo"];
      
      ctx.onLog(task.id, `Starting Gemini CLI in ${basePath} with model ${agent.model}`);

      try {
         const child = spawn(cmd, args, { cwd: basePath });

         child.stdout.on("data", (data) => {
            const text = data.toString().trim();
            if (text) ctx.onLog(task.id, text);
         });

         child.stderr.on("data", (data) => {
            const text = data.toString().trim();
            if (text) {
               ctx.onLog(task.id, `[DEBUG] ${text}`);
               if (text.toLowerCase().includes("error") || text.toLowerCase().includes("failed")) {
                  // Some stderr is just info/debug in gemini-cli, but we'll log it
               }
            }
         });

         child.on("error", (error: any) => {
            if (error.code === "ENOENT") {
               ctx.onLog(task.id, "Error: Gemini CLI ('gemini') not found in PATH.");
               ctx.onBugFound(task.id, "Gemini CLI not found.");
            } else {
               ctx.onLog(task.id, `Spawn Error: ${error.message}`);
               ctx.onBugFound(task.id, error.message);
            }
         });

         child.on("close", (code) => {
            this.runningTasks.delete(task.id);
            if (code === 0) {
               ctx.onLog(task.id, "Gemini CLI finished successfully.");
               ctx.onComplete(task.id);
            } else {
               ctx.onLog(task.id, `Gemini CLI exited with code ${code}`);
               ctx.onBugFound(task.id, `Execution failed with exit code ${code}`);
            }
         });

         this.runningTasks.set(task.id, child);
      } catch (e: any) {
         ctx.onLog(task.id, `Exception: ${e.message}`);
         ctx.onBugFound(task.id, e.message);
      }

      return Promise.resolve();
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         child.kill();
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
