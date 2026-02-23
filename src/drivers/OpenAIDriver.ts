import { Task, Agent, LLMDriver, DriverContext } from "../types.js";
import * as fs from "fs";
import * as path from "path";

export class OpenAIDriver implements LLMDriver {
   name: string = "OpenAI Codex (GPT-4)";
   private getCloneDir: () => string;

   constructor(getCloneDir: () => string) {
      this.getCloneDir = getCloneDir;
   }

   async executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void> {
      if (!process.env.OPENAI_API_KEY) {
          ctx.onLog(task.id, "Error: OPENAI_API_KEY not found in environment.");
          ctx.onBugFound(task.id, "Missing API Key");
          return;
      }

      const basePath = path.join(this.getCloneDir(), `task-${task.id}`);
      if (!fs.existsSync(basePath)) {
         fs.mkdirSync(basePath, { recursive: true });
      }

      const prompt = `
Task: ${task.title}
Description: ${task.description || "No description provided."}
Category: ${task.category}
Priority: ${task.priority}

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

      ctx.onLog(task.id, `Starting OpenAI Agent with model ${agent.model || "gpt-4o"}...`);

      try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
              },
              body: JSON.stringify({
                  model: agent.model || "gpt-4o",
                  messages: [
                      { role: "system", content: prompt },
                      { role: "user", content: "Please proceed with the task." }
                  ]
              })
          });

          if (!res.ok) {
              const errText = await res.text();
              throw new Error(`OpenAI API Error: ${res.status} ${errText}`);
          }

          const data = await res.json();
          const content = data.choices?.[0]?.message?.content || "";

          ctx.onLog(task.id, "Received response from OpenAI.");

          // Parse files
          const fileRegex = /<<<FILE:(.+?)>>>([\s\S]+?)<<<END>>>/g;
          let match;
          let filesCreated = 0;
          while ((match = fileRegex.exec(content)) !== null) {
             const filename = match[1].trim();
             let fileContent = match[2];
             if (fileContent.startsWith("\n")) fileContent = fileContent.substring(1);

             try {
                 const filePath = path.join(basePath, filename);
                 const fileDir = path.dirname(filePath);
                 if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

                 fs.writeFileSync(filePath, fileContent);
                 ctx.onLog(task.id, `[FILE] Wrote ${filename}`);
                 filesCreated++;
             } catch(e: any) {
                  ctx.onLog(task.id, `[ERROR] Failed to write ${filename}: ${e.message}`);
             }
          }

          ctx.onLog(task.id, `Task completed. Files created: ${filesCreated}`);
          ctx.onComplete(task.id);

      } catch (e: any) {
          ctx.onLog(task.id, `Exception: ${e.message}`);
          ctx.onBugFound(task.id, e.message);
      }
   }

   async interruptTask(task: Task): Promise<void> {
      // API calls are hard to interrupt mid-flight without AbortController,
      // but for this simple implementation we just acknowledge it.
      return Promise.resolve();
   }

   getLogs(taskId: number): string[] {
      return [];
   }
}
