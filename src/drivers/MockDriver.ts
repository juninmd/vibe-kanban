import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as path from "path";

export class MockDriver implements LLMDriver {
  name: string = "Mock Driver";
  private runningTasks = new Map<number, NodeJS.Timeout>();
  private taskLogs = new Map<number, string[]>();
  private getCloneDir?: () => string;

  constructor(getCloneDir?: () => string) {
    this.getCloneDir = getCloneDir;
  }

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const duration = task.priority === "alta" ? 6000 : 10000;
    this.taskLogs.set(task.id, []);

    // Ensure task dir exists if we can
    let taskDir = "";
    if (this.getCloneDir) {
        try {
            taskDir = path.join(this.getCloneDir(), `task-${task.id}`);
            if (!fs.existsSync(taskDir)) fs.mkdirSync(taskDir, { recursive: true });
        } catch (e) {
            console.error("MockDriver: Failed to create task dir", e);
        }
    }

    const steps = [
      { msg: "Analyzing requirements...", action: null },
      { msg: "Scanning codebase...", action: null },
      { msg: "Drafting solution...", action: () => {
          if (taskDir) {
              try {
                  fs.writeFileSync(path.join(taskDir, "plan.md"), `# Plan for ${task.title}\n1. Analyze\n2. Code\n3. Test`);
                  ctx.onLog(task.id, "[FILE] Wrote plan.md");
              } catch(e) {}
          }
      }},
      { msg: "Implementing changes...", action: () => {
          if (taskDir) {
              try {
                  fs.writeFileSync(path.join(taskDir, "solution.ts"), `// Solution for ${task.title}\nconsole.log("Fixed!");`);
                  ctx.onLog(task.id, "[FILE] Wrote solution.ts");
              } catch(e) {}
          }
      }},
      { msg: "Running unit tests...", action: null },
      { msg: "Final verification...", action: null }
    ];

    let stepIndex = 0;
    const intervalTime = Math.floor(duration / steps.length);

    const timer = setInterval(() => {
      if (stepIndex >= steps.length) {
        clearInterval(timer);
        this.runningTasks.delete(task.id);

        // 10% chance of finding a bug (reduced from 20% to be less annoying)
        if (Math.random() < 0.1) {
          ctx.onLog(task.id, "Bug detected during verification!");
          ctx.onBugFound(task.id, "Unexpected behavior in edge case.");
        } else {
          ctx.onLog(task.id, "Task completed successfully.");
          ctx.onComplete(task.id);
        }
        return;
      }

      const step = steps[stepIndex++];
      ctx.onLog(task.id, step.msg);
      if (step.action) step.action();

    }, intervalTime);

    this.runningTasks.set(task.id, timer);
    return Promise.resolve();
  }

  async interruptTask(task: Task): Promise<void> {
    const timer = this.runningTasks.get(task.id);
    if (timer) {
      clearInterval(timer);
      this.runningTasks.delete(task.id);
    }
    return Promise.resolve();
  }

  getLogs(taskId: number): string[] {
    return this.taskLogs.get(taskId) || [];
  }
}
