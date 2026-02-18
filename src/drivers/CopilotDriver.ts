import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { exec } from "child_process";

export class CopilotDriver implements LLMDriver {
  name: string = "Copilot SDK";
  private runningTasks = new Map<number, any>();

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const cmd = `copilot task "${task.title}" --model ${agent.model}`;
    ctx.onLog(task.id, `Running: ${cmd}`);

    const child = exec(cmd, (error, stdout, stderr) => {
      if (error) {
         // More robust check
         if (error.message.includes("not found") || (stderr && stderr.includes("not found"))) {
            ctx.onLog(task.id, "Copilot CLI not installed. Falling back to simulation.");
            this.simulateDevelopment(task, ctx);
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

  private simulateDevelopment(task: Task, ctx: DriverContext) {
     const steps = [
        "Analyzing workspace context...",
        `Synthesizing solution for "${task.title}"...`,
        "Suggesting code changes...",
        "Refactoring for style compliance...",
        "Verifying implementation..."
     ];

     let stepIndex = 0;
     const interval = setInterval(() => {
        if (stepIndex >= steps.length) {
           clearInterval(interval);
           this.runningTasks.delete(task.id);

           // 20% chance of finding a bug
           if (Math.random() < 0.2) {
              const bugMsg = "Test failed: Copilot suggestion introduced a regression.";
              ctx.onLog(task.id, bugMsg);
              ctx.onBugFound(task.id, bugMsg);
           } else {
              ctx.onLog(task.id, "Copilot: Suggestion accepted and merged.");
              ctx.onComplete(task.id);
           }
           return;
        }

        ctx.onLog(task.id, `Copilot: ${steps[stepIndex++]}`);
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
    return [];
  }
}
