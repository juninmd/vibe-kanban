import { Task, Agent, LLMDriver, DriverContext } from '../types.js';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectContext, extractAndWriteFiles } from '../utils/fileUtils.js';
import { isCommandAvailable } from '../utils/commandUtils.js';

export class GeminiDriver implements LLMDriver {
  name: string = 'Gemini CLI Driver';
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
    if (!isCommandAvailable('gemini')) {
      throw new Error('Gemini CLI not found in PATH. Please install it: npm install -g @google/gemini-cli');
    }

    const cmd = 'gemini';

    const isPlanMode = task.agentType === 'plan';

    // Prompts distintos para modo plan (somente leitura) e build (mutação)
    const prompt = isPlanMode
      ? `
[SYSTEM: PLAN MODE - READ ONLY]
You are an autonomous planning agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to ANALYZE the repository in this workspace and produce a high quality refactoring / implementation PLAN,
without making any file modifications yourself.

WORKSPACE: ${basePath}
TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || 'No description provided.'}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}

RULES:
1. TREAT THE FILESYSTEM AS READ-ONLY: do NOT modify, create or delete files.
2. Do NOT call tools that write to disk or run destructive commands.
3. Focus on understanding the architecture, listing impacted modules and files, and sequencing concrete steps.
4. Your final answer MUST be a structured JSON plan with:
   {
     "highLevelSummary": string,
     "steps": [
       {
         "file": "relative/path.ts",
         "summary": "short description of the change",
         "rationale": "why this change is needed"
       }
     ]
   }
5. Keep the JSON valid and minified (no comments).

Respond ONLY with the JSON object, nothing else.
`
      : `
[SYSTEM: AUTONOMOUS MODE]
You are an autonomous coding agent integrated into a Kanban board called "Vibe Kanban".
You are acting as the agent role: "${agent.role}".
Your goal is to complete the following task in this workspace.

TASK ID: #${task.id}
TITLE: ${task.title}
DESCRIPTION: ${task.description || 'No description provided.'}
CATEGORY: ${task.category}
PRIORITY: ${task.priority}

INSTRUCTIONS:
1. Explore the codebase if necessary.
2. Implement the requested changes.
3. Run tests or checks when appropriate.
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
    const args = ['-p', prompt, '-m', agent.model, '--yolo'];

    let fullOutput = '';

    ctx.onLog(task.id, `[SYSTEM] Iniciando Gemini CLI para Tarefa #${task.id}`);
    ctx.onLog(task.id, `[SYSTEM] Workspace: ${basePath}`);
    ctx.onLog(task.id, `[SYSTEM] Modelo: ${agent.model}`);

    try {
      const child = spawn(cmd, args, {
        cwd: basePath,
        env: env,
        shell: true, // Use shell for better compatibility on Windows
      });

      child.stdout.on('data', (data) => {
        const text = data.toString();
        fullOutput += text;
        // Clean up output for the terminal view
        const lines = text.split('\n');
        lines.forEach((line) => {
          const trimmed = line.trim();
          if (trimmed) ctx.onLog(task.id, trimmed);
        });
      });

      child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          // We log stderr but identify it
          ctx.onLog(task.id, `[STDERR] ${text}`);
        }
      });

      child.on('error', (error: any) => {
        if (error.code === 'ENOENT') {
          ctx.onLog(task.id, "Error: Gemini CLI ('gemini') not found in PATH.");
          ctx.onBugFound(task.id, 'Gemini CLI not found.');
        } else {
          ctx.onLog(task.id, `Spawn Error: ${error.message}`);
          ctx.onBugFound(task.id, error.message);
        }
      });

      child.on('close', (code) => {
        this.runningTasks.delete(task.id);

        if (isPlanMode) {
          // Em modo plano, não escrevemos arquivos — apenas retornamos o JSON para os logs.
          ctx.onLog(task.id, `[SYSTEM] Gemini PLAN finalizado com código ${code}.`);
          if (code === 0) {
            ctx.onLog(task.id, `[PLAN] ${fullOutput.trim()}`);
            ctx.onComplete(task.id);
          } else {
            ctx.onBugFound(task.id, `Planejamento falhou com código ${code}`);
          }
        } else {
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
        }
      });

      this.runningTasks.set(task.id, child);
    } catch (e: any) {
      ctx.onLog(task.id, `[EXCEPTION] ${e.message}`);
      ctx.onBugFound(task.id, e.message);
    }

    return Promise.resolve();
  }

  async interruptTask(task: Task): Promise<void> {
    const process = this.runningTasks.get(task.id);
    if (process) {
      try {
        if (process.kill) process.kill('SIGTERM');
      } catch (e) {
        // Process may have already exited
      }
      this.runningTasks.delete(task.id);
    }
    return Promise.resolve();
  }

  async listModels(): Promise<string[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return [];
    }
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (!res.ok) {
        return [];
      }
      const data: any = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      return models.map((m: any) => m.name as string).filter((id) => typeof id === 'string' && id.length > 0);
    } catch {
      return [];
    }
  }

  getLogs(taskId: number): string[] {
    // In this architecture, logs are managed by the server's context
    return [];
  }
}
