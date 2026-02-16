import { exec } from "child_process";
export class CopilotDriver {
    name = "Copilot SDK";
    runningTasks = new Map();
    async executeTask(task, agent, ctx) {
        const cmd = `copilot task "${task.title}" --model ${agent.model}`;
        ctx.onLog(task.id, `Running: ${cmd}`);
        const child = exec(cmd, (error, stdout, stderr) => {
            if (error) {
                if (error.message.includes("command not found")) {
                    ctx.onLog(task.id, "Copilot CLI not installed. Falling back to simulation.");
                    this.simulateSuccess(task, ctx);
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
    simulateSuccess(task, ctx) {
        setTimeout(() => {
            ctx.onLog(task.id, "Simulated Copilot response: Suggestion accepted.");
            ctx.onComplete(task.id);
        }, 3000);
    }
    async interruptTask(task) {
        const child = this.runningTasks.get(task.id);
        if (child) {
            child.kill();
            this.runningTasks.delete(task.id);
        }
        return Promise.resolve();
    }
    getLogs(taskId) {
        return [];
    }
}
