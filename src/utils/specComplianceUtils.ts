import { execa } from "execa";

export interface SpecComplianceCriterion {
  criterion: string;
  met: boolean;
  evidence: string;
}

export interface SpecComplianceResult {
  criteria: SpecComplianceCriterion[];
  summary: string;
  passed: boolean;
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

export async function getFullDiff(
  cwd: string,
  baseBranch: string,
  maxChars = 30_000,
): Promise<string> {
  try {
    const { stdout } = await execa("git", ["diff", baseBranch], { cwd });
    const diff = stdout.trim();
    if (diff.length <= maxChars) return diff;
    return `${diff.slice(0, maxChars)}\n\n[... diff truncated at ${maxChars} characters ...]`;
  } catch {
    return "";
  }
}

export function buildCompliancePrompt(issueTitle: string, issueId: number, criteria: string[], diff: string): string {
  const criteriaList = criteria.map((c, i) => `${i + 1}. ${c}`).join("\n");

  return `You are a spec compliance validator. Your ONLY task is to check if an implementation satisfies the acceptance criteria. Do NOT modify any files or run any commands.

## Issue
${issueId}: ${issueTitle}

## Acceptance Criteria
${criteriaList}

## Implementation (git diff)
\`\`\`diff
${diff}
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

export function parseComplianceResponse(output: string): SpecComplianceResult | null {
  const jsonPatterns = [
    /\{[\s\S]*"criteria"[\s\S]*\}/,
    /```(?:json)?\s*(\{[\s\S]*"criteria"[\s\S]*\})\s*```/,
  ];

  for (const pattern of jsonPatterns) {
    const match = pattern.exec(output);
    if (match) {
      const jsonStr = match[1] ?? match[0];
      try {
        const parsed = JSON.parse(jsonStr) as SpecComplianceResult;
        if (Array.isArray(parsed.criteria)) {
          const allMet = parsed.criteria.every((c) => c.met);
          return {
            criteria: parsed.criteria,
            passed: allMet,
            summary:
              parsed.summary ||
              `${parsed.criteria.filter((c) => c.met).length}/${parsed.criteria.length} criteria met`,
          };
        }
      } catch {
      }
    }
  }

  return null;
}

export function formatSpecCompliance(result: SpecComplianceResult): string {
  const lines: string[] = ["", "---", "## Spec Compliance", ""];
  lines.push(`**${result.summary}**`);
  lines.push("");
  lines.push("| Criterion | Status | Evidence |");
  lines.push("|-----------|--------|----------|");

  for (const c of result.criteria) {
    const status = c.met ? "Met" : "Not Met";
    const evidence = c.evidence.replace(/\|/g, "\\|").replace(/\n/g, " ");
    const criterion = c.criterion.replace(/\|/g, "\\|").replace(/\n/g, " ");
    lines.push(`| ${criterion} | ${status} | ${evidence} |`);
  }

  return lines.join("\n");
}
