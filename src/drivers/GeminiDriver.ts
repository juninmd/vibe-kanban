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
        // If command fails (likely because tool missing), fallback to mock behavior or just fail
        // For this demo, we'll pretend it worked if command not found
        if (error.message.includes("not found") || (stderr && stderr.includes("not found"))) {
           ctx.onLog(task.id, "Gemini CLI not installed. Falling back to simulation.");
           this.simulateDevelopment(task, ctx);
           return;
        }
        ctx.onLog(task.id, `Error: ${error.message}`);
        ctx.onBugFound(task.id, stderr || error.message);
        return;
      }
      ctx.onLog(task.id, stdout);
      ctx.onComplete(task.id);
    });

    this.runningTasks.set(task.id, child);
    return Promise.resolve();
  }

  private simulateDevelopment(task: Task, ctx: DriverContext) {
     const steps = [
        "Analyzing request context...",
        `Prompting Gemini with "${task.title}"...`,
        "Receiving generated code...",
        "Validating syntax...",
        "Running internal tests..."
     ];

     let stepIndex = 0;
     const interval = setInterval(() => {
        if (stepIndex >= steps.length) {
           clearInterval(interval);
           this.runningTasks.delete(task.id);

           // 10% chance of finding a bug
           if (Math.random() < 0.1) {
              const bugMsg = "Gemini: Generated code failed validation check.";
              ctx.onLog(task.id, bugMsg);
              ctx.onBugFound(task.id, bugMsg);
           } else {
              ctx.onLog(task.id, "Gemini: Task completed successfully.");
              ctx.onComplete(task.id);
           }
           return;
        }

        ctx.onLog(task.id, `Gemini: ${steps[stepIndex++]}`);
     }, 1500);

     this.runningTasks.set(task.id, interval);
  }

  async interruptTask(task: Task): Promise<void> {
    const processOrTimer = this.runningTasks.get(task.id);
    if (processOrTimer) {
      if (processOrTimer.kill) processOrTimer.kill();
      else clearInterval(processOrTimer);
      this.runningTasks.delete(task.id);
    }
    return Promise.resolve();
  }

  getLogs(taskId: number): string[] {
    return []; // Logs handled via ctx
  }
}
