import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { execa } from "execa";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { handleChildProcess } from "../utils/processHelpers.js";
import { createStallDetector, STALL_MESSAGE, startOverseer } from "../utils/overseerUtils.js";
import type { ChildProcess } from "child_process";

export class ClaudeDriver implements LLMDriver {
   name: string = "Claude Code";
   private runningTasks = new Map<number, ChildProcess>();

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

      const child = execa(cmd, args, { reject: false }) as unknown as ChildProcess;
      const stallDetector = createStallDetector(child, 120);
      const taskDir = task.workDir || process.cwd();
      const overseer = startOverseer(child, taskDir, { enabled: true, check_interval: 30, stuck_threshold: 300 });

      handleChildProcess(child, task, ctx, this.runningTasks, 120, overseer);
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
