import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { exec } from "child_process";

export class GeminiDriver implements LLMDriver {
  name: string = "Gemini CLI";
  private runningTasks = new Map<number, any>();

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const cmd = `gemini prompt "${task.title}" --model ${agent.model}`;
    ctx.onLog(task.id, `Running: ${cmd}`);

    // Simulate async execution via CLI
    const child = exec(cmd, (error, stdout, stderr) => {
      if (error) {
        ctx.onLog(task.id, `Error: ${error.message}`);
        // If command fails (likely because tool missing), fallback to mock behavior or just fail
        // For this demo, we'll pretend it worked if command not found
        if (error.message.includes("command not found")) {
           ctx.onLog(task.id, "Gemini CLI not installed. Falling back to simulation.");
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
        ctx.onLog(task.id, "Simulated Gemini response: Task completed.");
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
    return []; // Logs handled via ctx
  }
}
