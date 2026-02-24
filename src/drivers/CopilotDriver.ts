import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";

export class CopilotDriver implements LLMDriver {
   name: string = "Copilot SDK";
   private runningTasks = new Map<number, any>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const cmd = "gh";
      // Prepend role to title for context
      const promptContext = `[Role: ${agent.role}] ${task.title}`;
      const args = ["copilot", "suggest", promptContext, "--target", "nodejs"];
      ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

      const child = spawn(cmd, args);

      child.stdout.on("data", (data) => {
         ctx.onLog(task.id, data.toString());
      });

      child.stderr.on("data", (data) => {
         const msg = data.toString();
         if (msg.includes("not found") || msg.includes("ENOENT")) {
            // This might not catch everything but it's okay for now
         }
         ctx.onBugFound(task.id, msg);
      });

      child.on("error", (error: any) => {
         if (error.code === "ENOENT") {
            ctx.onLog(task.id, "Error: GitHub CLI/Copilot not found. Please install 'gh' and 'copilot' extension.");
            ctx.onBugFound(task.id, "Copilot not found.");
            return;
         }
         ctx.onBugFound(task.id, error.message);
      });

      child.on("close", (code) => {
         if (code === 0) {
            ctx.onComplete(task.id);
         } else {
            // Handle error
         }
      });

      this.runningTasks.set(task.id, child);
      return Promise.resolve();
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         if (child.kill) child.kill();
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
