import { spawn } from "child_process";
export class GeminiDriver {
    name = "Gemini CLI";
    runningTasks = new Map();
    async executeTask(task, agent, ctx) {
        const cmd = "gemini";
        const args = ["prompt", task.title, "--model", agent.model];
        ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);
        const child = spawn(cmd, args);
        child.stdout.on("data", (data) => {
            ctx.onLog(task.id, data.toString());
        });
        child.stderr.on("data", (data) => {
            const msg = data.toString();
            if (msg.includes("not found") || msg.includes("ENOENT")) {
                // This might not catch everything
            }
            ctx.onBugFound(task.id, msg);
        });
        child.on("error", (error) => {
            if (error.code === "ENOENT") {
                ctx.onLog(task.id, "Gemini CLI not installed. Falling back to simulation.");
                this.simulateDevelopment(task, ctx);
                return;
            }
            ctx.onLog(task.id, `Error: ${error.message}`);
            ctx.onBugFound(task.id, error.message);
        });
        child.on("close", (code) => {
            if (code === 0) {
                ctx.onComplete(task.id);
            }
            else {
                // Handle error if needed
            }
        });
        this.runningTasks.set(task.id, child);
        return Promise.resolve();
    }
    simulateDevelopment(task, ctx) {
        const steps = [
            "Analyzing request context with multimodal reasoning...",
            `Prompting Gemini Advanced with "${task.title}"...`,
            "Processing response stream...",
            "Validating syntax and logic...",
            "Running internal verification tests..."
        ];
        let stepIndex = 0;
        const interval = setInterval(() => {
            if (stepIndex >= steps.length) {
                clearInterval(interval);
                this.runningTasks.delete(task.id);
                // 10% chance of finding a bug
                if (Math.random() < 0.1) {
                    const bugMsg = "Gemini: Generated code failed validation check.";
                    ctx.onLog(task.id, bugMsg);
                    ctx.onBugFound(task.id, bugMsg);
                }
                else {
                    ctx.onLog(task.id, "Gemini: Task completed successfully.");
                    ctx.onComplete(task.id);
                }
                return;
            }
            ctx.onLog(task.id, `Gemini: ${steps[stepIndex++]}`);
        }, 1500);
        this.runningTasks.set(task.id, interval);
    }
    async interruptTask(task) {
        const processOrTimer = this.runningTasks.get(task.id);
        if (processOrTimer) {
            if (processOrTimer.kill)
                processOrTimer.kill();
            else
                clearInterval(processOrTimer);
            this.runningTasks.delete(task.id);
        }
        return Promise.resolve();
    }
    getLogs(taskId) {
        return []; // Logs handled via ctx
    }
}
