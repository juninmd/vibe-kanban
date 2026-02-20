import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";

export class CopilotDriver implements LLMDriver {
  name: string = "Copilot SDK";
  private runningTasks = new Map<number, any>();

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const cmd = "gh";
    const args = ["copilot", "suggest", task.title, "--target", "nodejs"];
    ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

    const child = spawn(cmd, args);

    child.stdout.on("data", (data) => {
      ctx.onLog(task.id, data.toString());
    });

    child.stderr.on("data", (data) => {
       const msg = data.toString();
       if (msg.includes("not found") || msg.includes("ENOENT")) {
          // This might not catch everything but it's okay for now
       }
       ctx.onBugFound(task.id, msg);
    });

    child.on("error", (error: any) => {
        if (error.code === "ENOENT") {
            ctx.onLog(task.id, "GitHub Copilot CLI not installed. Falling back to simulation.");
            this.simulateDevelopment(task, ctx);
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

  private simulateDevelopment(task: Task, ctx: DriverContext) {
     const steps = [
        "Analyzing workspace context...",
        `Synthesizing solution for "${task.title}"...`,
        "Suggesting code changes via Ghost Text...",
        "Refactoring for style compliance...",
        "Verifying implementation against existing patterns..."
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
