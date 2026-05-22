import fs from "fs";
import path from "path";
import { callLLM } from "./llmUtils.js";
import { getProjectContext } from "./fileUtils.js";

const PROMPT = `You are a project analyst. Your job is to document this repository so that future autonomous agents can work in it correctly.

Repository context:

<<<REPO_CONTEXT>>>

Read the project files and write a concise markdown document covering:

1. **Stack & Tools**: tools detected in this project and the EXACT commands to use (e.g., if package.json has a \`generate\` script, say "run \`pnpm run generate\` — not \`npx orval\` directly")
2. **File conventions**: where generated files live, migration naming patterns, any naming conventions observed from existing files
3. **Constraints**: anything an agent should NOT do (e.g., "do not run migrations manually — always use the \`db:push\` script")

Rules:
- Be concise — max 300 words. This is injected into every agent prompt.
- Write only what is non-obvious. Do NOT explain what tools are — only how they are used in THIS project.
- If nothing non-obvious exists (e.g., a plain Node.js project with no special tooling), write a single line: "No special tooling conventions."`;

export async function generateProjectContext(workDir: string): Promise<string | null> {
  const contextPath = path.join(workDir, ".lisa", "context.md");

  if (fs.existsSync(contextPath)) {
    return fs.readFileSync(contextPath, "utf-8");
  }

  // Need to read structure, package.json, README.md
  // Using fileUtils getProjectContext
  const repoContext = getProjectContext(workDir, 20000);

  const prompt = PROMPT.replace("<<<REPO_CONTEXT>>>", repoContext);

  const llmResult = await callLLM(prompt, "You are a senior project analyst.");

  if (llmResult) {
      const lisaDir = path.join(workDir, ".lisa");
      if (!fs.existsSync(lisaDir)) {
          fs.mkdirSync(lisaDir, { recursive: true });
      }
      fs.writeFileSync(contextPath, llmResult);
      return llmResult;
  }

  return null;
}
