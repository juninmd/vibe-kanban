import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import { isCommandAvailable } from "../utils/commandUtils.js";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { createStallDetector, STALL_MESSAGE } from "../utils/overseerUtils.js";

export class CopilotDriver implements LLMDriver {
   name: string = "Copilot CLI";
   private runningTasks = new Map<number, any>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      if (!isCommandAvailable("gh")) {
         throw new Error("GitHub CLI ('gh') not found. Please install it: https://cli.github.com/");
      }

      const cmd = "gh";
      const promptContext = `[Role: ${agent.role}] ${task.title}`;
      const args = ["copilot", "suggest", promptContext, "--target", "nodejs"];
      logDebugBlock(ctx, task.id, "AGENT PROMPT", promptContext);
      logDebugCommand(ctx, task.id, cmd, ["copilot", "suggest", "<prompt>", "--target", "nodejs"]);
      ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

      const child = spawn(cmd, args, { shell: true });
      const stallDetector = createStallDetector(child, 120);

      child.stdout.on("data", (data) => {
         stallDetector.update();
         ctx.onLog(task.id, data.toString());
      });

      child.stderr.on("data", (data) => {
         const msg = data.toString();
         ctx.onBugFound(task.id, msg);
      });

      child.on("error", (error: any) => {
         ctx.onBugFound(task.id, error.message);
      });

      child.on("close", (code) => {
         stallDetector.stop();

         if (stallDetector.wasStalled()) {
            ctx.onLog(task.id, STALL_MESSAGE);
            ctx.onBugFound(task.id, STALL_MESSAGE);
         } else if (code === 0) {
            ctx.onComplete(task.id);
         }
      });

      this.runningTasks.set(task.id, child);
      return Promise.resolve();
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         try {
            if (child.kill) child.kill();
         } catch (e) {}
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
