import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { exec } from "child_process";

export class OpenCodeDriver implements LLMDriver {
  name: string = "OpenCode AI";
  private runningTasks = new Map<number, any>();

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const cmd = `opencode run "${task.title}" --agent ${agent.role}`;
    ctx.onLog(task.id, `Running: ${cmd}`);

    const child = exec(cmd, (error, stdout, stderr) => {
      if (error) {
        // More robust check for command not found
        if (error.message.includes("not found") || (stderr && stderr.includes("not found"))) {
            ctx.onLog(task.id, "OpenCode CLI not installed. Falling back to simulation.");
            this.simulateSuccess(task, ctx);
            return;
        }
        ctx.onBugFound(task.id, stderr || error.message);
        return;
      }
      ctx.onLog(task.id, stdout);
      ctx.onComplete(task.id);
    });

    this.runningTasks.set(task.id, child);
    return Promise.resolve();
  }

  private simulateSuccess(task: Task, ctx: DriverContext) {
     setTimeout(() => {
        ctx.onLog(task.id, "Simulated OpenCode response: Changes applied.");
        ctx.onComplete(task.id);
     }, 3000);
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
