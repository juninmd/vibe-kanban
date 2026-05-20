import * as fs from "fs";
import * as path from "path";
import { callLLM } from "./llmUtils.js";

export function buildContextGenerationPrompt(repoPath: string, tree: string, packageJson: string, readme: string): string {
    return `You are a project analyst. Your job is to document this repository so that future autonomous agents can work in it correctly.

Repository path: \`${repoPath}\`

Directory Structure (Top Level):
\`\`\`
${tree}
\`\`\`

package.json:
\`\`\`
${packageJson}
\`\`\`

README.md (Snippet):
\`\`\`
${readme}
\`\`\`

Based on the files above, write a concise markdown document covering:

1. **Stack & Tools**: tools detected in this project and the EXACT commands to use (e.g., if package.json has a \`generate\` script, say "run \`pnpm run generate\` — not \`npx orval\` directly")
2. **File conventions**: where generated files live, migration naming patterns, any naming conventions observed from existing files
3. **Constraints**: anything an agent should NOT do (e.g., "do not run migrations manually — always use the \`db:push\` script")

Rules:
- Be concise — max 300 words. This is injected into every agent prompt.
- Write only what is non-obvious. Do NOT explain what tools are — only how they are used in THIS project.
- If nothing non-obvious exists (e.g., a plain Node.js project with no special tooling), write a single line: "No special tooling conventions."
- Return ONLY the markdown document content, no wrapping code blocks if possible.`;
}

export async function ensureProjectContext(workDir: string): Promise<string | null> {
    const lisaDir = path.join(workDir, ".lisa");
    const contextPath = path.join(lisaDir, "context.md");

    try {
        if (fs.existsSync(contextPath)) {
            return fs.readFileSync(contextPath, "utf-8");
        }

        // Gather basic context
        let packageJson = "N/A";
        const pkgPath = path.join(workDir, "package.json");
        if (fs.existsSync(pkgPath)) {
            packageJson = fs.readFileSync(pkgPath, "utf-8").slice(0, 3000);
        }

        let readme = "N/A";
        const readmePath = path.join(workDir, "README.md");
        if (fs.existsSync(readmePath)) {
            readme = fs.readFileSync(readmePath, "utf-8").slice(0, 3000);
        }

        let tree = "N/A";
        try {
            const files = fs.readdirSync(workDir);
            tree = files.slice(0, 50).join("\n");
        } catch (e) {
            // Ignore
        }

        const prompt = buildContextGenerationPrompt(workDir, tree, packageJson, readme);
        const generatedContext = await callLLM(prompt, "You are a project analyst.");

        if (generatedContext) {
            let finalContext = generatedContext.trim();
            // Remove markdown code block if LLM wrapped it
            if (finalContext.startsWith("\`\`\`markdown")) {
                finalContext = finalContext.replace(/^\`\`\`markdown\n/, "").replace(/\n\`\`\`$/, "");
            } else if (finalContext.startsWith("\`\`\`")) {
                 finalContext = finalContext.replace(/^\`\`\`\n/, "").replace(/\n\`\`\`$/, "");
            }

            if (!fs.existsSync(lisaDir)) {
                fs.mkdirSync(lisaDir, { recursive: true });
            }
            fs.writeFileSync(contextPath, finalContext, "utf-8");
            return finalContext;
        }

        return null;
    } catch (e) {
        console.warn(`Failed to ensure project context for ${workDir}:`, e);
        return null;
    }
}
