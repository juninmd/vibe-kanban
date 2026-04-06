import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import { spawn } from "child_process";
import { isCommandAvailable } from "../utils/commandUtils.js";
import { logDebugBlock, logDebugCommand } from "./debugLogging.js";
import { handleChildProcess } from "../utils/processHelpers.js";
import { createStallDetector, STALL_MESSAGE } from "../utils/overseerUtils.js";
import { DB } from "../db.js";
import { getLineageContext } from "../utils/promptUtils.js";

import { ChildProcess } from "child_process";

export class CopilotDriver implements LLMDriver {
   name: string = "Copilot CLI";
   private runningTasks = new Map<number, ChildProcess>();

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      if (!isCommandAvailable("gh")) {
         throw new Error("GitHub CLI ('gh') not found. Please install it: https://cli.github.com/");
      }

      const siblings = task.groupId ? DB.getTasksByGroupId(task.groupId).filter(t => t.id !== task.id) : [];
      const lineageContext = getLineageContext(task, siblings);

      const cmd = "gh";
      const promptContext = `[Role: ${agent.role}] ${task.title}\n${lineageContext}`;
      const args = ["copilot", "suggest", promptContext, "--target", "nodejs"];
      logDebugBlock(ctx, task.id, "AGENT PROMPT", promptContext);
      logDebugCommand(ctx, task.id, cmd, ["copilot", "suggest", "<prompt>", "--target", "nodejs"]);
      ctx.onLog(task.id, `Running: ${cmd} ${args.join(" ")}`);

      const child = spawn(cmd, args, { shell: true });
      const stallDetector = createStallDetector(child, 120);

      handleChildProcess(child, task, ctx, this.runningTasks, 120);
      return Promise.resolve();
   }

   async interruptTask(task: Task): Promise<void> {
      const child = this.runningTasks.get(task.id);
      if (child) {
         try {
            if (child.kill) child.kill();
         } catch (e) {}
         this.runningTasks.delete(task.id);
      }
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
