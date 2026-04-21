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

export function extractAcceptanceCriteria(description: string): string[] {
    const criteria: string[] = [];

    // Extract markdown checklist items: - [ ] Something
    const checklistRegex = /^[\t ]*- \[ \]\s*(.+)$/gm;
    let match: RegExpExecArray | null;
    match = checklistRegex.exec(description);
    while (match) {
        if (match[1]) criteria.push(match[1].trim());
        match = checklistRegex.exec(description);
    }

    if (criteria.length > 0) return criteria;

    // Fallback: extract lines under "Acceptance Criteria" / "Critérios de Aceite" header
    const headerRegex = /(?:acceptance criteria|critérios de aceite|expected behavior)[:\s]*\n/i;
    const headerMatch = headerRegex.exec(description);
    if (headerMatch) {
        const afterHeader = description.slice(headerMatch.index + headerMatch[0].length);
        const lines = afterHeader.split("\n");
        for (const line of lines) {
            const trimmed = line.trim();
            // Stop at next header or empty line after content
            if (trimmed.startsWith("#") || trimmed.startsWith("---")) break;
            // Capture list items
            const listMatch = /^[-*]\s+(.+)$/.exec(trimmed);
            if (listMatch?.[1]) {
                criteria.push(listMatch[1].trim());
            }
            const numberedMatch = /^\d+[.)]\s+(.+)$/.exec(trimmed);
            if (numberedMatch?.[1]) {
                criteria.push(numberedMatch[1].trim());
            }
        }
    }

    return criteria;
}

export function buildCompliancePrompt(title: string, criteria: string[], diff: string): string {
    const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");

    return `You are a spec compliance validator. Your ONLY task is to check if an implementation satisfies the acceptance criteria. Do NOT modify any files or run any commands.

## Issue
${title}

## Acceptance Criteria
${criteriaList}

## Implementation (git diff)
\`\`\`diff
${diff.substring(0, 100000)}
\`\`\`

## Task
For each acceptance criterion above, determine if the implementation (git diff) satisfies it.

Respond with ONLY a valid JSON object — no markdown fences, no explanation, no other text:

{
  "criteria": [
    { "criterion": "the criterion text", "met": true, "evidence": "brief explanation of how it's met" },
    { "criterion": "the criterion text", "met": false, "evidence": "what is missing or wrong" }
  ],
  "summary": "X/Y criteria met",
  "passed": false
}

IMPORTANT:
- Do NOT create, edit, or modify any files.
- Do NOT run any shell commands.
- Do NOT create branches or commits.
- ONLY output the JSON object above.`;
}

export function buildComplianceRecoveryPrompt(title: string, unmetCriteria: { criterion: string; evidence: string }[]): string {
    const unmetList = unmetCriteria
        .map((c, i) => `${i + 1}. **${c.criterion}**\n   Reason: ${c.evidence}`)
        .join("\n\n");

    return `You are continuing work on issue: "${title}".

Your implementation was checked against the acceptance criteria and the following were NOT met:

${unmetList}

Fix ONLY the unmet criteria above. Commit and push your changes.

IMPORTANT:
- Do NOT create a new branch — you are already on the correct branch.
- Fix ONLY the unmet criteria listed above.
- Commit and push your fixes.
- Do NOT create a PR — that will be handled separately.`;
}

export async function verifySpecCompliance(
    title: string,
    description: string,
    diff: string
): Promise<{ success: boolean; unmetCriteria: string[]; allResults: { criterion: string; met: boolean; evidence: string }[] }> {
    const criteria = extractAcceptanceCriteria(description);

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

    const prompt = buildCompliancePrompt(title, criteria, diff);

    try {
        const content = await callLLM(prompt, "You return JSON objects representing spec compliance results.");
        if (content) {
            // Parse JSON object as from the new prompt
            const jsonPatterns = [
                // Direct JSON object
                /\{[\s\S]*"criteria"[\s\S]*\}/,
                // Inside markdown code fence
                /\`\`\`(?:json)?\s*(\{[\s\S]*"criteria"[\s\S]*\})\s*\`\`\`/
            ];

            let parsed: any = null;
            for (const pattern of jsonPatterns) {
                const match = pattern.exec(content);
                if (match) {
                    const jsonStr = match[1] ?? match[0];
                    try {
                        parsed = JSON.parse(jsonStr);
                        break;
                    } catch (e) { // reason
                        // Try next pattern
                    }
                }
            }

            if (parsed && Array.isArray(parsed.criteria)) {
                allResults = parsed.criteria;
                for (const result of parsed.criteria) {
                    if (result.met === false) {
                        unmetCriteria.push(`${result.criterion}: ${result.evidence}`);
                    }
                }
            } else {
                throw new Error("Invalid JSON structure returned by LLM");
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
