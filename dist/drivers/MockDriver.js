export class MockDriver {
    name = "Mock Driver";
    runningTasks = new Map();
    taskLogs = new Map();
    async executeTask(task, agent, ctx) {
        const duration = task.priority === "alta" ? 5000 : 8000;
        this.taskLogs.set(task.id, []);
        const steps = [
            "Analyzing requirements...",
            "Scanning codebase...",
            "Implementing changes...",
            "Running unit tests...",
            "Refactoring code...",
            "Final verification..."
        ];
        let stepIndex = 0;
        const intervalTime = Math.floor(duration / steps.length);
        const interval = setInterval(() => {
            if (stepIndex >= steps.length) {
                clearInterval(interval);
                this.runningTasks.delete(task.id);
                // 20% chance of finding a bug
                if (Math.random() < 0.2) {
                    ctx.onLog(task.id, "Bug detected during verification!");
                    ctx.onBugFound(task.id, "Unexpected behavior in edge case.");
                }
                else {
                    ctx.onLog(task.id, "Task completed successfully.");
                    ctx.onComplete(task.id);
                }
                return;
            }
            const msg = steps[stepIndex++];
            const logs = this.taskLogs.get(task.id) || [];
            logs.push(msg);
            this.taskLogs.set(task.id, logs);
            ctx.onLog(task.id, msg);
        }, intervalTime);
        this.runningTasks.set(task.id, interval);
        return Promise.resolve();
    }
    async interruptTask(task) {
        const timer = this.runningTasks.get(task.id);
        if (timer) {
            clearInterval(timer);
            this.runningTasks.delete(task.id);
        }
        return Promise.resolve();
    }
    getLogs(taskId) {
        return this.taskLogs.get(taskId) || [];
    }
}
