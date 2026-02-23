import * as fs from "fs";
import * as path from "path";
import { DriverContext } from "../types.js";

/**
 * Recursively reads a directory and returns a string representation of its contents,
 * skipping node_modules, .git, and large files.
 */
export function getProjectContext(dir: string, maxChars: number = 20000): string {
    let context = "Current Project Files:\n";
    let charCount = 0;

    const walk = (currentDir: string, relativePath: string) => {
        if (charCount >= maxChars) return;

        let items: string[] = [];
        try { items = fs.readdirSync(currentDir); } catch (e) { return; }

        for (const item of items) {
            if (item === "node_modules" || item === ".git" || item === "dist" || item === ".DS_Store") continue;

            const fullPath = path.join(currentDir, item);
            const relPath = path.join(relativePath, item);
            let stat;
            try { stat = fs.statSync(fullPath); } catch (e) { continue; }

            if (stat.isDirectory()) {
                walk(fullPath, relPath);
            } else {
                // Always list file
                context += `File: ${relPath}\n`;

                // Read content if small text file
                const ext = path.extname(item).toLowerCase();
                if ([".ts", ".js", ".json", ".md", ".txt", ".html", ".css", ".py"].includes(ext) && stat.size < 10000) {
                    try {
                        const content = fs.readFileSync(fullPath, "utf-8");
                        if (charCount + content.length < maxChars) {
                            context += `--- START ${relPath} ---\n${content}\n--- END ${relPath} ---\n`;
                            charCount += content.length;
                        }
                    } catch (e) {}
                }
            }
        }
    };
    if (fs.existsSync(dir)) walk(dir, "");
    return context;
}

/**
 * Parses the LLM output for <<<FILE:filename>>>content<<<END>>> blocks
 * and writes them to the specified base path.
 * Returns the number of files created.
 */
export function extractAndWriteFiles(output: string, basePath: string, ctx: DriverContext, taskId: number): number {
    const fileRegex = /<<<FILE:(.+?)>>>([\s\S]+?)<<<END>>>/g;
    let match;
    let filesCreated = 0;

    while ((match = fileRegex.exec(output)) !== null) {
       const filename = match[1].trim();
       let content = match[2];
       if (content.startsWith("\n")) content = content.substring(1);

       try {
           const filePath = path.join(basePath, filename);
           const fileDir = path.dirname(filePath);
           if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

           fs.writeFileSync(filePath, content);
           ctx.onLog(taskId, `[FILE] Wrote ${filename}`);
           filesCreated++;
       } catch(e: any) {
            ctx.onLog(taskId, `[ERROR] Failed to write ${filename}: ${e.message}`);
       }
    }
    return filesCreated;
}
