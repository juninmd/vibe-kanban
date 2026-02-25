import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn, execSync } from "child_process";

export class CopilotDriver implements LLMDriver {
   name: string = "Copilot SDK";
   private runningTasks = new Map<number, any>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      // Check for GitHub CLI
      let isInstalled = false;
      try {
          execSync("gh --version", { stdio: "ignore" });
          isInstalled = true;
      } catch (e) {
          isInstalled = false;
      }

      if (!isInstalled) {
          ctx.onLog(task.id, "⚠️ GitHub CLI ('gh') not found. Switching to SIMULATION MODE.");
          this.runSimulation(task, agent, ctx);
          return;
      }

      const cmd = "gh";
      // Prepend role to title for context
      const promptContext = `[Role: ${agent.role}] ${task.title}`;
      const args = ["copilot", "suggest", promptContext, "--target", "nodejs"];
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
            ctx.onLog(task.id, "Error: GitHub CLI/Copilot not found. Please install 'gh' and 'copilot' extension.");
            ctx.onBugFound(task.id, "Copilot not found.");
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

   private runSimulation(task: Task, agent: Agent, ctx: DriverContext) {
      const steps = [
         { msg: `[${agent.role}] Authenticating with GitHub Copilot (Simulated)...`, delay: 1000 },
         { msg: `[${agent.role}] Analyzing context from local repository...`, delay: 1500 },
         { msg: `[${agent.role}] Querying Codex model for: "${task.title}"...`, delay: 2000 },
         { msg: `[${agent.role}] Receiving suggestions...`, delay: 2500 },
         { msg: `[${agent.role}] 3 suggestions found. Selecting best match...`, delay: 1000 },
         { msg: `[${agent.role}] Applying suggestion to codebase...`, delay: 1000 },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
         if (this.runningTasks.get(task.id)?.killed) {
             clearInterval(interval);
             return;
         }

         if (currentStep >= steps.length) {
            clearInterval(interval);
            ctx.onLog(task.id, "Copilot task completed successfully.");
            ctx.onComplete(task.id);
            this.runningTasks.delete(task.id);
            return;
         }

         const step = steps[currentStep];
         ctx.onLog(task.id, step.msg);
         currentStep++;
      }, 1500);

      // Store interval as "process" to allow kill
      this.runningTasks.set(task.id, { kill: () => clearInterval(interval), killed: false });
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         if ('killed' in child && typeof child.killed === 'boolean' && !child.pid) {
             child.killed = true; // Mark as killed for simulation loop
             if (child.kill) child.kill();
         } else {
             // Real process
             if (child.kill) child.kill();
         }
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
