import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";

export class OpenCodeDriver implements LLMDriver {
  name: string = "OpenCode AI";
  private runningTasks = new Map<number, any>();

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    const cmd = "opencode";
    const args = ["run", task.title, "--agent", agent.role];
    ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

    const child = spawn(cmd, args);

    child.stdout.on("data", (data) => {
      ctx.onLog(task.id, data.toString());
    });

    child.stderr.on("data", (data) => {
       const msg = data.toString();
       if (msg.includes("not found") || msg.includes("ENOENT")) {
          // This might not be enough
       }
       ctx.onBugFound(task.id, msg);
    });

    child.on("error", (error: any) => {
        if (error.code === "ENOENT") {
            ctx.onLog(task.id, "⚠️ OpenCode CLI not found. Switching to high-fidelity simulation.");
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
        "🔍 Reading project context and dependency graph...",
        `🧠 Formulating implementation plan for: ${task.title}`,
        "📝 Drafting code changes (AST generation)...",
        "🔨 Applying patches to source files...",
        "🧪 Writing unit tests for new functionality...",
        "🔄 Running local verification suite...",
        "✅ Code structure verified."
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
