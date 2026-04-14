import { execa } from "execa";
import type { Task } from "../types.js";

const STOP_WORDS = new Set([
	"the", "a", "an", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall", "can", "need", "must", "and", "or", "but", "not", "no", "nor", "so", "yet", "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "into", "through", "during", "before", "after", "above", "below", "between", "out", "off", "over", "under", "again", "further", "then", "once", "here", "there", "when", "where", "why", "how", "all", "each", "every", "both", "few", "more", "most", "other", "some", "such", "only", "own", "same", "than", "too", "very", "just", "because", "if", "while", "until", "about", "this", "that", "these", "those", "it", "its", "i", "we", "you", "they", "he", "she", "me", "us", "him", "her", "them", "my", "our", "your", "their", "what", "which", "who", "whom", "whose",
	"de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos", "um", "uma", "uns", "umas", "por", "para", "com", "sem", "sob", "como", "mais", "menos", "muito", "quando", "onde", "que", "qual", "se", "ou", "ao", "aos", "pela", "pelo", "pelas", "pelos", "ser", "ter", "estar", "fazer", "ir", "vir", "poder", "dever", "isso", "isto", "esse", "esta", "este", "essa", "aquele", "aquela",
	"add", "fix", "update", "change", "create", "remove", "delete", "implement", "feature", "bug", "issue", "error", "new", "file", "code", "function", "method", "class", "type", "interface",
]);

const EXCLUDE_DIRS = [
	"node_modules", ".git", "dist", "build", ".next", ".nuxt", "coverage", ".cache", ".worktrees", ".lisa",
];

const EXCLUDE_EXTENSIONS = [
	"*.lock", "*.map", "*.min.js", "*.min.css", "*.d.ts", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.svg", "*.ico", "*.woff", "*.woff2", "*.ttf", "*.eot",
];

export function extractKeywords(text: string): string[] {
	const cleaned = text
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`]+`/g, "")
		.replace(/https?:\/\/\S+/g, "")
		.replace(/[#*_[\](){}|>~]/g, " ");

	const words = cleaned
		.split(/[\s/\\.,;:!?'"()[\]{}<>=+\-*&^%$@#~`|]+/)
		.map((w) => w.toLowerCase().trim())
		.filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
		.filter((w) => !/^\d+$/.test(w));

	return [...new Set(words)];
}

export async function enrichContext(cwd: string, task: Task): Promise<string | null> {
	const keywords = extractKeywords(`${task.title} ${task.description || ""}`);
	if (keywords.length === 0) return null;

	const excludeDirArgs = EXCLUDE_DIRS.flatMap((d) => ["--exclude-dir", d]);
	const excludeExtArgs = EXCLUDE_EXTENSIONS.flatMap((e) => ["--exclude", e]);
	const includeArgs = [
		"*.ts", "*.tsx", "*.js", "*.jsx", "*.py", "*.rb", "*.go", "*.rs", "*.java", "*.yaml", "*.yml", "*.json",
	].flatMap((p) => ["--include", p]);

	const fileCounts = new Map<string, number>();

	const searches = keywords.slice(0, 15).map(async (keyword) => {
		try {
			const { stdout } = await execa(
				"grep",
				["-rl", ...excludeDirArgs, ...excludeExtArgs, "-i", ...includeArgs, "--", keyword, "."],
				{ cwd, encoding: "utf8", timeout: 5000, maxBuffer: 1024 * 1024, reject: false }
			);
            if (!stdout) return [];
			return stdout.trim().split("\n").filter(Boolean);
		} catch {
			return [];
		}
	});

	const results = await Promise.all(searches);
	for (const files of results) {
		for (const file of files) {
			const rel = file.startsWith("./") ? file.slice(2) : file;
			fileCounts.set(rel, (fileCounts.get(rel) ?? 0) + 1);
		}
	}

	if (fileCounts.size === 0) return null;

	const ranked = [...fileCounts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([file]) => file);

	const fileList = ranked.map((f) => `- \`${f}\``).join("\n");

	return `## Relevant Files\n\nBased on the issue description, these files are likely relevant:\n\n${fileList}\n\nRead these files first to understand the existing implementation before making changes.`;
}
