import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Task, Agent, LLMDriver, DriverContext } from "../types.js";

export class CommandDriver implements LLMDriver {
    name: string = "CLI Command Driver";
    private runningTasks = new Map<number, ChildProcessWithoutNullStreams>();
    private taskLogs = new Map<number, string[]>();
    private getCloneDir: () => string;

    constructor(getCloneDir: () => string) {
        this.getCloneDir = getCloneDir;
    }

    async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
        this.taskLogs.set(task.id, []);
        const baseDir = this.getCloneDir();
        const taskDir = path.join(baseDir, `task-${task.id}`);

        if (!fs.existsSync(taskDir)) {
            try {
                fs.mkdirSync(taskDir, { recursive: true });
                ctx.onLog(task.id, `Created directory: ${taskDir}`);
            } catch (e) {
                ctx.onLog(task.id, `Error creating directory: ${e}`);
            }
        }

        let command = "";
        let args: string[] = [];
        const prompt = `Task: ${task.title}\nDescription: ${task.description || ""}\nSource: ${task.source}\nProvide a brief execution log of the actions you would take to complete this task.`;

        if (agent.tool === "ollama") {
            command = "ollama";
            args = ["run", agent.model, prompt];
        } else if (agent.tool === "gemini") {
            command = "gemini";
            args = [prompt];
        } else {
            ctx.onLog(task.id, `Unknown tool configured for agent: ${agent.tool}`);
            ctx.onComplete(task.id);
            return;
        }

        ctx.onLog(task.id, `Starting process: ${command} ${args.join(" ")} in ${taskDir}`);

        try {
            const child = spawn(command, args, { cwd: taskDir });
            this.runningTasks.set(task.id, child);

            child.stdout.on("data", (data) => {
                const text = data.toString().trim();
                if (text) {
                    this.appendLog(task.id, text);
                    ctx.onLog(task.id, text);
                }
            });

            child.stderr.on("data", (data) => {
                const text = data.toString().trim();
                if (text) {
                    this.appendLog(task.id, `[STDERR] ${text}`);
                    ctx.onLog(task.id, text);
                }
            });

            child.on("close", (code) => {
                this.runningTasks.delete(task.id);
                if (code === 0) {
                    ctx.onLog(task.id, "Process completed successfully.");
                    ctx.onComplete(task.id);
                } else {
                    ctx.onLog(task.id, `Process exited with code ${code}`);
                    ctx.onBugFound(task.id, `Process exited with code ${code}`);
                }
            });

            child.on("error", (error) => {
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
            this.appendLog(task.id, "Task interrupted by user.");
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
