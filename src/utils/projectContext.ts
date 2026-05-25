import fs from "fs";
import path from "path";
import { execa } from "execa";
import { callLLM } from "./llmUtils.js";

/**
 * Autonomously generates a `.lisa/context.md` file by analyzing the repository structure,
 * package.json, and README.md, providing tech stack and convention guidance.
 */
export async function generateProjectContext(workDir: string): Promise<string | null> {
    const lisaDir = path.join(workDir, ".lisa");
    const contextFile = path.join(lisaDir, "context.md");

    // Check if context already exists
    if (fs.existsSync(contextFile)) {
        return fs.readFileSync(contextFile, "utf-8");
    }

    try {
        if (!fs.existsSync(lisaDir)) {
            fs.mkdirSync(lisaDir, { recursive: true });
        }

        let pkgJson = "";
        const pkgPath = path.join(workDir, "package.json");
        if (fs.existsSync(pkgPath)) {
            pkgJson = fs.readFileSync(pkgPath, "utf-8");
        }

        let readme = "";
        const readmePath = path.join(workDir, "README.md");
        if (fs.existsSync(readmePath)) {
            readme = fs.readFileSync(readmePath, "utf-8").slice(0, 2000); // Take first 2k chars
        }

        let treeOutput = "";
        try {
            const { stdout } = await execa("ls", ["-R"], { cwd: workDir });
            treeOutput = stdout.slice(0, 3000); // limit to 3k chars
        } catch {
            treeOutput = "Unable to read directory tree.";
        }

        const prompt = `You are a technical context analyzer. Generate a concise markdown document outlining the tech stack, tools, and coding conventions of the project based on the following artifacts:

## Directory Structure
${treeOutput}

## package.json
${pkgJson || "N/A"}

## README
${readme || "N/A"}

Provide sections for:
1. Tech Stack
2. Tool Commands (e.g. build, test, lint)
3. Conventions

Output strictly valid markdown.`;

        const generatedContext = await callLLM(prompt);

        if (generatedContext) {
            fs.writeFileSync(contextFile, generatedContext, "utf-8");
            return generatedContext;
        }
    } catch (err: unknown) {
        console.warn("Failed to generate project context:", err);
    }

    return null;
}
