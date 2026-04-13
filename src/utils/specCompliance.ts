import { callLLM } from "./llmUtils.js";

export interface SpecComplianceResult {
    met: boolean;
    evidence: string;
}

export function formatSpecCompliance(results: { criterion: string; met: boolean; evidence: string }[]): string {
    const lines: string[] = ["", "---", "## Spec Compliance", ""];
    const metCount = results.filter(r => r.met).length;
    const summary = `${metCount}/${results.length} criteria met`;
    lines.push(`**${summary}**`);
    lines.push("");
    lines.push("| Criterion | Status | Evidence |");
    lines.push("|-----------|--------|----------|");

    for (const c of results) {
        const status = c.met ? "Met" : "Not Met";
        const evidence = (c.evidence || "").toString().replace(/\|/g, "\\|").replace(/\n/g, " ");
        const criterion = (c.criterion || "").toString().replace(/\|/g, "\\|").replace(/\n/g, " ");
        lines.push(`| ${criterion} | ${status} | ${evidence} |`);
    }

    return lines.join("\n");
}

export async function verifySpecCompliance(
    description: string,
    diff: string
): Promise<{ success: boolean; unmetCriteria: string[]; allResults: { criterion: string; met: boolean; evidence: string }[] }> {
    const lines = description.split('\n');
    const criteria: string[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('- [ ]') || trimmed.startsWith('- []')) {
            criteria.push(trimmed.replace(/^- \[\s?\]/, '').trim());
        }
    }

    if (criteria.length === 0) {
        return { success: true, unmetCriteria: [], allResults: [] };
    }

    if (!diff || diff.trim() === '') {
        const unmetCriteria = criteria.map(c => `Diff is empty, cannot verify: ${c}`);
        const allResults = criteria.map(c => ({ criterion: c, met: false, evidence: "Diff is empty" }));
        return { success: false, unmetCriteria, allResults };
    }

    const unmetCriteria: string[] = [];
    let allResults: { criterion: string; met: boolean; evidence: string }[] = [];

    const prompt = `You are a strict QA agent. Your job is to verify if the given git diff meets the specified acceptance criteria.
For each criterion, evaluate if the changes in the diff satisfy the requirement.

Git Diff:
${diff.substring(0, 100000)} // Truncate at a higher limit (e.g., 100k chars) to leverage larger context windows

Acceptance Criteria:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Return ONLY a JSON array of objects with the following structure, one for each criterion:
[
  {
    "criterion": "The description of the criterion",
    "met": true, // or false
    "evidence": "Brief explanation of why it was met or not met based on the diff"
  }
]`;

    try {
        const content = await callLLM(prompt, "You return JSON arrays representing spec compliance results.");
        if (content) {
            const startIdx = content.indexOf('[');
            const endIdx = content.lastIndexOf(']');
            if (startIdx !== -1 && endIdx !== -1) {
                const results = JSON.parse(content.substring(startIdx, endIdx + 1));
                if (Array.isArray(results)) {
                    allResults = results;
                    for (const result of results) {
                        if (result.met === false) {
                            unmetCriteria.push(`${result.criterion}: ${result.evidence}`);
                        }
                    }
                }
            }
        } else {
             // Fallback if LLM fails, assume not met to be safe
             const unmetCriteria = ['Failed to verify criteria due to LLM error'];
             allResults = criteria.map(c => ({ criterion: c, met: false, evidence: "LLM error" }));
             return { success: false, unmetCriteria, allResults };
        }
    } catch (error) {
        console.error("Spec compliance verification failed:", error);
        const unmetCriteria = ['Error parsing LLM response for spec verification'];
        allResults = criteria.map(c => ({ criterion: c, met: false, evidence: "Parse error" }));
        return { success: false, unmetCriteria, allResults };
    }

    return {
        success: unmetCriteria.length === 0,
        unmetCriteria,
        allResults
    };
}
