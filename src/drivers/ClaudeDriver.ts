import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { createStallDetector, STALL_MESSAGE } from "../utils/overseerUtils.js";

export class ClaudeDriver implements LLMDriver {
   name: string = "Claude Code";
   private runningTasks = new Map<number, any>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      let guardrails = "";
      if (task.lastError) {
          guardrails += `\n[GUARDRAILS]\nPREVIOUS ATTEMPT FAILED WITH ERROR:\n${task.lastError}\nEnsure you fix the issue and do not repeat the same mistake.\n`;
      }
      if (task.siblingContext) {
          guardrails += `\n[SIBLING TASKS CONTEXT]\n${task.siblingContext}\nEnsure you focus ONLY on your assigned task and do not duplicate work being done by others.\n`;
      }

      const promptContext = `${task.title}\n${task.description || ""}\n${guardrails}`;

      const cmd = "claude";
      const args = ["prompt", promptContext, "--model", agent.model];
      logDebugBlock(
         ctx,
         task.id,
         "AGENT PROMPT",
         promptContext,
      );
      logDebugCommand(ctx, task.id, cmd, ["prompt", "<prompt>", "--model", agent.model]);
      ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

      const child = spawn(cmd, args);
      const stallDetector = createStallDetector(child, 120);

      child.stdout.on("data", (data) => {
         stallDetector.update();
         ctx.onLog(task.id, data.toString());
      });

      child.stderr.on("data", (data) => {
         const msg = data.toString();
         if (msg.includes("not found") || msg.includes("ENOENT")) {
            // This might not be enough as spawn error event is separate
         }
         ctx.onBugFound(task.id, msg);
      });

      child.on("error", (error: any) => {
         if (error.code === "ENOENT") {
            ctx.onLog(task.id, "Error: Claude CLI not found. Please install 'claude-code'.");
            ctx.onBugFound(task.id, "Claude not found.");
            return;
         }
         ctx.onBugFound(task.id, error.message);
      });

      child.on("close", (code) => {
         stallDetector.stop();
         this.runningTasks.delete(task.id);

         if (stallDetector.wasStalled()) {
            ctx.onLog(task.id, STALL_MESSAGE);
            ctx.onBugFound(task.id, STALL_MESSAGE);
         } else if (code === 0) {
            ctx.onComplete(task.id);
         } else {
            ctx.onBugFound(task.id, `Claude exited with code ${code}`);
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
