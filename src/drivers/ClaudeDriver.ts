import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { handleChildProcess } from "../utils/processHelpers.js";
import { startOverseer } from "../utils/overseerUtils.js";
import { ChildProcess } from "child_process";

export class ClaudeDriver implements LLMDriver {
   name: string = "Claude Code";
   private runningTasks = new Map<number, ChildProcess>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      const cmd = "claude";
      const taskDir = task.workDir || process.cwd();
      const fullPrompt = [
         `[Role: ${agent.role}]`,
         `Task: ${task.title}`,
         task.description ? `Description: ${task.description}` : "",
         `Category: ${task.category} | Priority: ${task.priority}`,
         `Work directory: ${taskDir}`,
         "Complete the task by writing, editing, and committing code. Work autonomously without asking for input.",
      ].filter(Boolean).join("\n");

      const args = ["-p", fullPrompt, "--model", agent.model];
      logDebugBlock(ctx, task.id, "AGENT PROMPT", fullPrompt);
      logDebugCommand(ctx, task.id, cmd, ["-p", "<prompt>", "--model", agent.model]);
      ctx.onLog(task.id, `Running: ${cmd} -p "<prompt>" --model ${agent.model}`);

      const child = spawn(cmd, args, { cwd: taskDir, env: { ...process.env } });
      const overseer = startOverseer(child, taskDir, { enabled: true, check_interval: 30, stuck_threshold: 300 });

      handleChildProcess(child, task, ctx, this.runningTasks, 120, overseer);
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

   getLogs(_taskId: number): string[] {
      return [];
   }
}

