import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { createErrorLoopDetector, createSessionTimeout, createStallDetector, handleOverseerResults, startOverseer } from "../utils/overseerUtils.js";

export class ClaudeDriver implements LLMDriver {
   name: string = "Claude Code";
   private runningTasks = new Map<number, any>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const cmd = "claude";
      const args = ["prompt", task.title, "--model", agent.model];
      logDebugBlock(
         ctx,
         task.id,
         "AGENT PROMPT",
         `TITLE: ${task.title}\nDESCRIPTION: ${task.description || "No description provided."}`,
      );
      logDebugCommand(ctx, task.id, cmd, ["prompt", "<prompt>", "--model", agent.model]);
      ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

      const child = spawn(cmd, args);
      const stallDetector = createStallDetector(child, 120);
      const sessionTimeout = createSessionTimeout(child, 600);
      const errorLoopDetector = createErrorLoopDetector(child, /error/i, 25);
      const overseer = startOverseer(child, task.workDir || ".", { enabled: true, check_interval: 30, stuck_threshold: 300 });

      child.stdout.on("data", (data) => {
         stallDetector.update();
         ctx.onLog(task.id, data.toString());
      });

      child.stderr.on("data", (data) => {
         const msg = data.toString();
         errorLoopDetector.check(msg);
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
         sessionTimeout.stop();
         overseer.stop();
         this.runningTasks.delete(task.id);

         handleOverseerResults(
            task,
            ctx,
            sessionTimeout,
            overseer,
            errorLoopDetector,
            stallDetector,
            code,
            0,
            ""
         );
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
