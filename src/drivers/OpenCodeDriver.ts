import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";

export class OpenCodeDriver implements LLMDriver {
   name: string = "OpenCode AI";
   private runningTasks = new Map<number, any>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const cmd = "opencode";
      const args = ["run", task.title, "--agent", agent.role];
      ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

      const child = spawn(cmd, args);

      child.stdout.on("data", (data) => {
         ctx.onLog(task.id, data.toString());
      });

      child.stderr.on("data", (data) => {
         const msg = data.toString();
         if (msg.includes("not found") || msg.includes("ENOENT")) {
            // This might not be enough
         }
         ctx.onBugFound(task.id, msg);
      });

      child.on("error", (error: any) => {
         if (error.code === "ENOENT") {
            ctx.onLog(task.id, "Error: OpenCode CLI not found. Please install 'opencode'.");
            ctx.onBugFound(task.id, "OpenCode not found.");
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
         if (child.kill) child.kill(); // child process
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
