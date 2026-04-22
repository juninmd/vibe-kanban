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
