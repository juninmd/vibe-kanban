import { ChildProcess } from "child_process";
import { Task, DriverContext } from "../types.js";
import { createStallDetector, STALL_MESSAGE } from "./overseerUtils.js";

export function handleChildProcess(child: ChildProcess, task: Task, ctx: DriverContext, runningTasks: Map<number, any>, timeoutSeconds = 120, overseer?: any) {
    const stallDetector = createStallDetector(child, timeoutSeconds);

    child.stdout?.on("data", (data) => {
        stallDetector.update();
        const text = data.toString();
        if (overseer && /reading|analyzing|searching|grep|cat|ls|find/i.test(text)) {
            overseer.notifyActivity();
        }
        ctx.onLog(task.id, text);
    });

    child.stderr?.on("data", (data) => {
        ctx.onBugFound(task.id, data.toString());
    });

    child.on("error", (error: any) => {
        ctx.onBugFound(task.id, error.message);
    });

    child.on("close", (code) => {
        stallDetector.stop();
        if (overseer) overseer.stop();
        runningTasks.delete(task.id);

        if (stallDetector.wasStalled()) {
            ctx.onLog(task.id, STALL_MESSAGE);
            ctx.onBugFound(task.id, STALL_MESSAGE);
        } else if (code === 0) {
            ctx.onComplete(task.id);
        } else {
            ctx.onBugFound(task.id, `Process exited with code ${code}`);
        }
    });

    runningTasks.set(task.id, child);
}
