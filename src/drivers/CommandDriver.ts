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
        const basePath = path.join(this.getCloneDir(), `task-${task.id}`);

        if (!fs.existsSync(basePath)) {
            try {
                fs.mkdirSync(basePath, { recursive: true });
                ctx.onLog(task.id, `Created directory: ${basePath}`);
            } catch (e) {
                ctx.onLog(task.id, `Error creating directory: ${e}`);
            }
        }

        ctx.onLog(task.id, `[Sandbox] Executing in isolated directory: ${basePath}`);

        let command = "";
        let args: string[] = [];
        let fullOutput = "";

        const prompt = `Task: ${task.title}
Description: ${task.description || ""}
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

        if (agent.tool === "ollama") {
            command = "ollama";
            args = ["run", agent.model, prompt];
        } else if (agent.tool === "gemini") {
            command = "gemini";
            args = ["-p", prompt, "-m", agent.model || "gemini-2.0-flash", "--yolo"];
        } else {
            ctx.onLog(task.id, `Unknown tool configured for agent: ${agent.tool}`);
            ctx.onComplete(task.id);
            return;
        }

        ctx.onLog(task.id, `Starting process: ${command} ${args.join(" ")} in ${basePath}`);

        try {
            const child = spawn(command, args, { cwd: basePath });
            this.runningTasks.set(task.id, child);

            child.stdout.on("data", (data) => {
                const text = data.toString();
                fullOutput += text;
                const trimmed = text.trim();
                if (trimmed) {
                    this.appendLog(task.id, trimmed);
                    ctx.onLog(task.id, trimmed);
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

                // Parse files
                const fileRegex = /<<<FILE:(.+?)>>>([\s\S]+?)<<<END>>>/g;
                let match;
                let filesCreated = 0;
                while ((match = fileRegex.exec(fullOutput)) !== null) {
                    const filename = match[1].trim();
                    let content = match[2];
                    if (content.startsWith("\n")) content = content.substring(1);

                    try {
                        const filePath = path.join(basePath, filename);
                        const fileDir = path.dirname(filePath);
                        if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

                        fs.writeFileSync(filePath, content);
                        ctx.onLog(task.id, `[FILE] Wrote ${filename}`);
                        filesCreated++;
                    } catch(e: any) {
                         ctx.onLog(task.id, `[ERROR] Failed to write ${filename}: ${e.message}`);
                    }
                }

                if (code === 0) {
                    ctx.onLog(task.id, `Process completed. Files created: ${filesCreated}`);
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
