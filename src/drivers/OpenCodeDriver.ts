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
        "Analyzing codebase structure...",
        `Generating implementation plan for "${task.title}"...`,
        "Applying changes via AST transformation...",
        "Writing unit tests...",
        "Running verification suite..."
     ];

     let stepIndex = 0;
     const interval = setInterval(() => {
        if (stepIndex >= steps.length) {
           clearInterval(interval);
           this.runningTasks.delete(task.id);

           // 20% chance of finding a bug
           if (Math.random() < 0.2) {
              const bugMsg = "Test failed: Edge case not handled in OpenCode generation.";
              ctx.onLog(task.id, bugMsg);
              ctx.onBugFound(task.id, bugMsg);
           } else {
              ctx.onLog(task.id, "OpenCode: Changes verified and committed.");
              ctx.onComplete(task.id);
           }
           return;
        }

        ctx.onLog(task.id, `OpenCode: ${steps[stepIndex++]}`);
     }, 1500); // 1.5s per step

     this.runningTasks.set(task.id, interval);
  }

  async interruptTask(task: Task): Promise<void> {
    const processOrTimer = this.runningTasks.get(task.id);
    if (processOrTimer) {
      if (processOrTimer.kill) processOrTimer.kill(); // child process
      else clearInterval(processOrTimer); // interval
      this.runningTasks.delete(task.id);
    }
    return Promise.resolve();
  }

  getLogs(taskId: number): string[] {
    return [];
  }
}
