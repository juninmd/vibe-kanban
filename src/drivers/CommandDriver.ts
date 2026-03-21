import { execa } from 'execa';
import * as fs from 'fs';
import * as path from 'path';
import { Task, Agent, LLMDriver, DriverContext } from '../types.js';
import { extractAndWriteFiles } from '../utils/fileUtils.js';

export class CommandDriver implements LLMDriver {
  name: string = 'CLI Command Driver';
  private runningTasks = new Map<number, any>();
  private taskLogs = new Map<number, string[]>();
  private getCloneDir: () => string;
  private terminalManager?: any; // TerminalManager

  constructor(getCloneDir: () => string, terminalManager?: any) {
    this.getCloneDir = getCloneDir;
    this.terminalManager = terminalManager;
  }

  private resolveWorkDir(task: Task): string {
    // Priority: task.workDir > cloneDir/task-{id}
    if (task.workDir) {
      if (!fs.existsSync(task.workDir)) {
        fs.mkdirSync(task.workDir, { recursive: true });
      }
      return task.workDir;
    }
    const baseDir = this.getCloneDir();
    const taskDir = path.join(baseDir, `task-${task.id}`);
    if (!fs.existsSync(taskDir)) {
      fs.mkdirSync(taskDir, { recursive: true });
    }
    return taskDir;
  }

  async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
    this.taskLogs.set(task.id, []);
    const taskDir = this.resolveWorkDir(task);

    ctx.onLog(task.id, `[Sandbox] Executing in: ${taskDir}`);

    let command = '';
    let args: string[] = [];
    let fullOutput = '';

    const prompt = `Task: ${task.title}
Description: ${task.description || ''}
Source: ${task.source}

You are an autonomous coding agent. Your goal is to complete the task by writing code.
To create or overwrite a file, use the following format exactly:

<<<FILE:filename.ext>>>
file content here
<<<END>>>

Example:
<<<FILE:hello.py>>>
print("Hello World")
<<<END>>>

Do not output hypothetical logs. Output the actual file content needed to solve the task.`;

    if (agent.tool === 'opencode' && this.terminalManager) {
      // Use TerminalManager for OpenCode
      ctx.onLog(task.id, `[PTY] Starting OpenCode in agent terminal...`);

      try {
        // Ensure terminal is started
        if (!this.terminalManager.isAlive(agent.id)) {
          await this.terminalManager.create({
            agentId: agent.id,
            cwd: taskDir,
            env: { ...process.env, ...agent.env } as any,
          });
        }

        const cmd = `opencode run --prompt "${prompt.replace(/"/g, '\\"')}" --model "${agent.model || 'gpt-4o'}"\r`;
        this.terminalManager.write(agent.id, cmd);

        // For PTY, we don't have a simple "on close" for the command since the shell stays alive.
        // We'd need to monitor the output for a completion marker or just let it be interactive.
        // However, to maintain the current flow, we'll just log that it started.
        // In a real terminal focus, the user will see it and interact.

        ctx.onLog(task.id, `Command sent to PTY. Monitor the terminal panel for output.`);
        // We don't call ctx.onComplete here because it's interactive.
        // But for the sake of the Kanban transition, maybe we should?
        // The user's request says "cada agente = terminal", implying the process IS the terminal.
        return;
      } catch (e: any) {
        ctx.onLog(task.id, `PTY Error: ${e.message}`);
        ctx.onBugFound(task.id, `PTY Execution failed: ${e.message}`);
        return;
      }
    }

    if (agent.tool === 'ollama') {
      command = 'ollama';
      args = ['run', agent.model, prompt];
    } else if (agent.tool === 'gemini') {
      command = 'gemini';
      args = ['-p', prompt, '-m', agent.model || 'gemini-2.0-flash', '--yolo'];
    } else if (agent.tool === 'claude') {
      command = 'claude';
      args = ['prompt', prompt, '--model', agent.model || 'claude-sonnet-4-20250514'];
    } else if (agent.tool === 'opencode') {
      command = 'opencode';
      args = ['run', '--prompt', prompt, '--model', agent.model || 'gpt-4o'];
    } else {
      ctx.onLog(task.id, `Unknown tool configured for agent: ${agent.tool}`);
      ctx.onComplete(task.id);
      return;
    }

    ctx.onLog(task.id, `Starting: ${command} ${args[0]} in ${taskDir}`);

    try {
      const child = execa(command, args, { cwd: taskDir, reject: false });
      this.runningTasks.set(task.id, child);

      child.stdout.on('data', (data) => {
        const text = data.toString();
        fullOutput += text;
        const trimmed = text.trim();
        if (trimmed) {
          this.appendLog(task.id, trimmed);
          ctx.onLog(task.id, trimmed);
        }
      });

      child.stderr.on('data', (data) => {
        const text = data.toString().trim();
        if (text) {
          this.appendLog(task.id, `[STDERR] ${text}`);
          ctx.onLog(task.id, text);
        }
      });

      child.on('close', (code) => {
        this.runningTasks.delete(task.id);

        // Use shared file extraction utility
        const filesCreated = extractAndWriteFiles(fullOutput, taskDir, ctx, task.id);

        if (code === 0) {
          ctx.onLog(task.id, `Process completed. Files created: ${filesCreated}`);
          ctx.onComplete(task.id);
        } else {
          ctx.onLog(task.id, `Process exited with code ${code}`);
          ctx.onBugFound(task.id, `Process exited with code ${code}`);
        }
      });

      child.on('error', (error) => {
        this.runningTasks.delete(task.id);
        ctx.onLog(task.id, `Error spawning process: ${error.message}`);
        ctx.onBugFound(task.id, `Execution failed: ${error.message}`);
      });
    } catch (e: any) {
      ctx.onLog(task.id, `Exception: ${e.message}`);
      ctx.onBugFound(task.id, `Exception during execution: ${e.message}`);
    }
  }

  async interruptTask(task: Task): Promise<void> {
    const child = this.runningTasks.get(task.id);
    if (child) {
      child.kill();
      this.runningTasks.delete(task.id);
      this.appendLog(task.id, 'Task interrupted by user.');
    }
    return Promise.resolve();
  }

  getLogs(taskId: number): string[] {
    return this.taskLogs.get(taskId) || [];
  }

  private appendLog(taskId: number, msg: string) {
    const logs = this.taskLogs.get(taskId) || [];
    logs.push(msg);
    this.taskLogs.set(taskId, logs);
  }
}
