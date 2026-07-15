export interface GeneratedTask {
  title?: string;
  description?: string;
  category?: string;
  priority?: string;
  acceptanceCriteria?: string[];
  relevantFiles?: string[];
  order?: number;
  dependsOn?: number[];
  verifyCommand?: string;
  doneCriteria?: string;
}

export interface ValidationFinding {
  dimension: string;
  severity: "low" | "medium" | "high";
  description: string;
  suggestion: string;
  issueOrder?: number;
}

export interface PlanValidationResult {
  passed: boolean;
  findings: ValidationFinding[];
  refinedIssues?: GeneratedTask[];
}

/**
 * Detect dependency cycles using Kahn's algorithm (BFS topological sort).
 * Returns `null` if the dependency graph is a valid DAG, or an array of
 * human-readable cycle descriptions if cycles exist.
 */
export function detectDependencyCycles(tasks: GeneratedTask[]): string[] | null {
  const taskByOrder = new Map<number, GeneratedTask>();
  for (const task of tasks) {
    if (typeof task.order === "number") {
      taskByOrder.set(task.order, task);
    }
  }

  // Build adjacency list and in-degree map
  const adjacency = new Map<number, number[]>();
  const inDegree = new Map<number, number>();

  for (const task of tasks) {
    if (typeof task.order === "number") {
      adjacency.set(task.order, []);
      inDegree.set(task.order, 0);
    }
  }

  for (const task of tasks) {
    if (typeof task.order === "number" && task.dependsOn && Array.isArray(task.dependsOn)) {
      for (const dep of task.dependsOn) {
        if (!adjacency.has(dep)) continue; // skip unknown dependencies
        adjacency.get(dep)!.push(task.order);
        inDegree.set(task.order, (inDegree.get(task.order) ?? 0) + 1);
      }
    }
  }

  // BFS: start with nodes that have no incoming edges
  const queue: number[] = [];
  for (const [order, degree] of inDegree) {
    if (degree === 0) queue.push(order);
  }

  const sorted: number[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  // If not all nodes were sorted, cycles exist
  const totalNodesWithOrder = Array.from(taskByOrder.keys()).length;
  if (sorted.length === totalNodesWithOrder) return null;

  // Identify nodes involved in cycles
  const sortedSet = new Set(sorted);
  const cycleNodes = tasks
    .filter((t) => typeof t.order === "number" && !sortedSet.has(t.order))
    .map((t) => `#${t.order} "${t.title}"`);

  return [`Circular dependency involving: ${cycleNodes.join(" -> ")}`];
}

/**
 * Detect files that appear in the \`relevantFiles\` of 2+ issues.
 * Returns entries where a file is touched by multiple issues (merge conflict risk).
 */
export function detectFileOverlaps(
  tasks: GeneratedTask[]
): Array<{ file: string; issues: number[] }> {
  const fileMap = new Map<string, number[]>();

  for (const task of tasks) {
    if (typeof task.order === "number" && task.relevantFiles && Array.isArray(task.relevantFiles)) {
      for (const file of task.relevantFiles) {
        const existing = fileMap.get(file);
        if (existing) {
          existing.push(task.order);
        } else {
          fileMap.set(file, [task.order]);
        }
      }
    }
  }

  const overlaps: Array<{ file: string; issues: number[] }> = [];
  for (const [file, taskOrders] of fileMap) {
    if (taskOrders.length >= 2) {
      overlaps.push({ file, issues: taskOrders });
    }
  }

  return overlaps;
}

/**
 * Build a prompt that asks the AI to evaluate a plan across 6 quality dimensions.
 */
export function buildPlanValidationPrompt(
  goal: string,
  issues: GeneratedTask[],
  contextMd?: string | null
): string {
  const contextBlock = contextMd ? `\n## Context\n\n${contextMd}\n` : "";
  const issuesBlock = issues
    .map((issue) => {
      const deps = issue.dependsOn && issue.dependsOn.length > 0 ? ` (depends on: ${issue.dependsOn.join(", ")})` : "";
      const verify = issue.verifyCommand ? `\n  Verify: ${issue.verifyCommand}` : "";
      const done = issue.doneCriteria ? `\n  Done: ${issue.doneCriteria}` : "";
      const files =
        issue.relevantFiles && issue.relevantFiles.length > 0 ? `\n  Files: ${issue.relevantFiles.join(", ")}` : "";
      const criteria =
        issue.acceptanceCriteria && issue.acceptanceCriteria.length > 0
          ? `\n  Criteria: ${issue.acceptanceCriteria.join("; ")}`
          : "";
      return `${issue.order}. ${issue.title}${deps}${files}${criteria}${verify}${done}`;
    })
    .join("\n\n");

  return `You are a plan quality validator. Your ONLY task is to evaluate whether an implementation plan is well-structured and complete. Do NOT modify any files or run any commands.

Always respond in the same language the user wrote their goal in.

## Goal

${goal}
${contextBlock}
## Plan to Validate

${issuesBlock}

## Evaluation Dimensions

Evaluate the plan across these 6 dimensions:

1. **Requirement Coverage**: Does the plan fully address the stated goal? Are there aspects of the goal that no issue covers?
2. **Task Atomicity**: Is each issue small enough to complete in a single AI coding session (under 1 hour)? Are any issues too broad or too granular?
3. **Dependency Correctness**: Are dependencies properly ordered? Are there missing dependencies where one issue clearly requires another to be completed first?
4. **File Scope**: Is the file scope per task reasonable? Do multiple issues modify the same files (merge conflict risk)?
5. **Verification**: Does each issue have testable acceptance criteria or a verify command? Can completion be objectively determined?
6. **Gap Detection**: Are there missing implementation steps? Would executing all issues actually achieve the goal?

## Response Format

Respond with ONLY a valid JSON object — no markdown fences, no explanation, no other text:

{
  "passed": true,
  "findings": [
    { "dimension": "requirement_coverage", "severity": "low", "description": "Minor: no logging added", "suggestion": "Consider adding a logging issue" }
  ],
  "refinedPlan": null
}

When "passed" is false, include a "refinedPlan" with the corrected issues:

{
  "passed": false,
  "findings": [
    { "dimension": "gap_detection", "severity": "high", "description": "Missing database migration step", "suggestion": "Add an issue for the migration", "issueOrder": 2 }
  ],
  "refinedPlan": {
    "issues": [
      { "title": "...", "description": "...", "category": "feature", "priority": "alta", "acceptanceCriteria": ["..."], "relevantFiles": ["..."], "order": 1, "dependsOn": [], "verifyCommand": "...", "doneCriteria": "..." }
    ]
  }
}

IMPORTANT:
- Set "passed" to false ONLY for high-severity findings that would cause implementation failure.
- Medium and low findings are informational — the plan can still pass.
- Do NOT create, edit, or modify any files.
- Do NOT run any shell commands.
- ONLY output the JSON object above.`;
}

function parseRefinedIssues(parsed: Record<string, unknown>): GeneratedTask[] | undefined {
  const refined = parsed.refinedPlan as { issues?: unknown[] } | null | undefined;
  if (!refined?.issues || !Array.isArray(refined.issues)) return undefined;

  return refined.issues
    .filter(
      (i): i is Record<string, unknown> =>
        typeof i === "object" &&
        i !== null &&
        typeof (i as Record<string, unknown>).title === "string"
    )
    .map((issue, idx) => ({
      title: String(issue.title),
      description: typeof issue.description === "string" ? issue.description : "",
      category: typeof issue.category === "string" ? issue.category : "feature",
      priority: typeof issue.priority === "string" ? issue.priority : "media",
      acceptanceCriteria: Array.isArray(issue.acceptanceCriteria)
        ? (issue.acceptanceCriteria as unknown[]).filter((c): c is string => typeof c === "string")
        : [],
      relevantFiles: Array.isArray(issue.relevantFiles)
        ? (issue.relevantFiles as unknown[]).filter((f): f is string => typeof f === "string")
        : [],
      order: typeof issue.order === "number" ? issue.order : idx + 1,
      dependsOn: Array.isArray(issue.dependsOn)
        ? (issue.dependsOn as unknown[]).filter((d): d is number => typeof d === "number")
        : [],
      verifyCommand: typeof issue.verifyCommand === "string" ? issue.verifyCommand : undefined,
      doneCriteria: typeof issue.doneCriteria === "string" ? issue.doneCriteria : undefined,
    }));
}

/**
 * Parse the plan validation JSON response from the AI.
 * Resilient to markdown fences and extra text around the JSON.
 */
export function parsePlanValidationResponse(output: string): PlanValidationResult | null {
  const jsonPatterns = [
    /\{[\s\S]*"findings"[\s\S]*\}/,
    /```(?:json)?\s*(\{[\s\S]*"findings"[\s\S]*\})\s*```/,
  ];

  for (const pattern of jsonPatterns) {
    const match = pattern.exec(output);
    if (match) {
      const jsonStr = match[1] ?? match[0];
      try {
        const parsed = JSON.parse(jsonStr) as PlanValidationResult & Record<string, unknown>;
        if (Array.isArray(parsed.findings)) {
          const hasHighSeverity = parsed.findings.some((f) => f.severity === "high");
          return {
            passed: hasHighSeverity ? false : parsed.passed !== false,
            findings: parsed.findings,
            refinedIssues: parseRefinedIssues(parsed),
          };
        }
      } catch {
        // Try next pattern
      }
    }
  }

  return null;
}
