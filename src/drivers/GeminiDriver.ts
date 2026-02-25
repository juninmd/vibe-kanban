import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { getProjectContext, extractAndWriteFiles } from "../utils/fileUtils.js";

export class GeminiDriver implements LLMDriver {
   name: string = "Gemini CLI Driver";
   private runningTasks = new Map<number, any>();
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
      this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      // Prioritize task-specific workDir, fallback to cloning pattern
      const basePath = task.workDir || path.join(this.getCloneDir(), `task-${task.id}`);
      
      if (!fs.existsSync(basePath)) {
         fs.mkdirSync(basePath, { recursive: true });
      }

      // Check if Gemini is installed
      let isInstalled = false;
      try {
         execSync("gemini --version", { stdio: "ignore" });
         isInstalled = true;
      } catch (e) {
         isInstalled = false;
      }

      if (!isInstalled) {
         ctx.onLog(task.id, "⚠️ Gemini CLI not found. Switching to SIMULATION MODE.");
         this.runSimulation(task, agent, ctx, basePath);
         return;
      }

      const cmd = "gemini";

      // Autonomous prompt: we give the task and some context, but we let Gemini use its tools.
      const prompt = `
[SYSTEM: AUTONOMOUS MODE]
You are an autonomous agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to complete the following task in this workspace.

TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || "No description provided."}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}

INSTRUCTIONS:
1. Explore the codebase if necessary.
2. Implement the requested changes.
3. Verify your work.
4. When finished, provide a brief summary of what you did.

If you don't have tool access, use this format to create/update files:
<<<FILE:filename.ext>>>
content
<<<END>>>
`;

      // Pass current environment to the child process (includes GEMINI_API_KEY, etc.)
      const env = { ...process.env };

      // Arguments for gemini CLI
      // We use --yolo to allow it to run tools without asking for confirmation if enabled in its config
      const args = ["-p", prompt, "-m", agent.model, "--yolo"];
      
      let fullOutput = "";

      ctx.onLog(task.id, `[SYSTEM] Iniciando Gemini CLI para Tarefa #${task.id}`);
      ctx.onLog(task.id, `[SYSTEM] Workspace: ${basePath}`);
      ctx.onLog(task.id, `[SYSTEM] Modelo: ${agent.model}`);

      try {
         const child = spawn(cmd, args, { 
            cwd: basePath,
            env: env,
            shell: true // Use shell for better compatibility on Windows
         });

         child.stdout.on("data", (data) => {
            const text = data.toString();
            fullOutput += text;
            // Clean up output for the terminal view
            const lines = text.split("\n");
            lines.forEach(line => {
               const trimmed = line.trim();
               if (trimmed) ctx.onLog(task.id, trimmed);
            });
         });

         child.stderr.on("data", (data) => {
            const text = data.toString().trim();
            if (text) {
               // We log stderr but identify it
               ctx.onLog(task.id, `[STDERR] ${text}`);
            }
         });

         child.on("error", (error: any) => {
            if (error.code === "ENOENT") {
               ctx.onLog(task.id, "Error: Gemini CLI ('gemini') not found in PATH.");
               ctx.onBugFound(task.id, "Gemini CLI not found.");
            } else {
               ctx.onLog(task.id, `Spawn Error: ${error.message}`);
               ctx.onBugFound(task.id, error.message);
            }
         });

         child.on("close", (code) => {
            this.runningTasks.delete(task.id);

            // Fallback: Parse files if Gemini used the text format instead of tools
            const filesCreated = extractAndWriteFiles(fullOutput, basePath, ctx, task.id);

            if (code === 0) {
               ctx.onLog(task.id, `[SYSTEM] Gemini CLI finalizado com sucesso.`);
               if (filesCreated > 0) ctx.onLog(task.id, `[SYSTEM] Blocos de arquivos detectados: ${filesCreated}`);
               ctx.onComplete(task.id);
            } else {
               ctx.onLog(task.id, `[SYSTEM] Gemini CLI encerrou com código ${code}`);
               ctx.onBugFound(task.id, `Execução falhou com código ${code}`);
            }
         });

         this.runningTasks.set(task.id, child);
      } catch (e: any) {
         ctx.onLog(task.id, `[EXCEPTION] ${e.message}`);
         ctx.onBugFound(task.id, e.message);
      }

      return Promise.resolve();
   }

   private runSimulation(task: Task, agent: Agent, ctx: DriverContext, taskDir: string) {
      const steps = [
         { msg: `[${agent.role}] Initializing Gemini 2.0 Flash Simulation...`, delay: 1000 },
         { msg: `[${agent.role}] Reading project context from ${taskDir}...`, delay: 1500 },
         { msg: `[${agent.role}] Analyzing task: "${task.title}"...`, delay: 2000 },
         { msg: `[${agent.role}] Identifying necessary changes...`, delay: 2000 },
         { msg: `[${agent.role}] Generating code solution...`, delay: 2500 },
         { msg: `[${agent.role}] Validating syntax...`, delay: 1000 },
         { msg: `[${agent.role}] Writing files to disk...`, delay: 1000 },
      ];

      let currentStep = 0;
      const interval = setInterval(() => {
         if (this.runningTasks.get(task.id)?.killed) {
             clearInterval(interval);
             return;
         }

         if (currentStep >= steps.length) {
            clearInterval(interval);

            // Create dummy file
            try {
                const filename = "solution.md";
                const content = `# Solution for ${task.title}\n\nGenerated by ${agent.model} (Simulation)\n\n## Summary\nImplemented the requested feature successfully.\n`;
                fs.writeFileSync(path.join(taskDir, filename), content);
                ctx.onLog(task.id, `[FILE] Wrote ${filename}`);
            } catch (e) { }

            ctx.onLog(task.id, "Gemini simulation completed successfully.");
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
      const process = this.runningTasks.get(task.id);
      if (process) {
         // Check if it's our simulation object (has 'killed' property we can write to)
         // or a real ChildProcess (where 'killed' is readonly)
         if ('killed' in process && typeof process.killed === 'boolean' && !process.pid) {
             process.killed = true; // Mark as killed for simulation loop
             if (process.kill) process.kill();
         } else {
             // Real process
             if (process.kill) process.kill("SIGTERM");
         }
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      // In this architecture, logs are managed by the server's context
      return [];
   }
}
