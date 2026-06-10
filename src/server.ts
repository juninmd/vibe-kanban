// POST /api/integrations/linear/sync (Import issues from Linear)
  if (url === "/api/integrations/linear/sync" && method === "POST") {
    const body = await parseBody(req);
    const apiKey = (body.apiKey as string) || process.env.LINEAR_API_KEY || "";
    if (!apiKey) return jsonResponse(res, 400, { error: "Missing Linear API Key" });

    try {
      const issues = await fetchLinearIssues(apiKey);
      let count = 0;
      for (const issue of issues) {
        if (!issue.title) continue;
        const exists = DB.getTasks().find(t => t.description?.includes(issue.url) || t.title === issue.title);
        if (!exists) {
          let priority: Task["priority"] = "baixa";
          if (issue.priority === 1) priority = "alta";
          else if (issue.priority === 2) priority = "media";

          DB.createTask({
            title: issue.title,
            source: "linear_integration",
            category: "feature",
            priority,
            lane: "backlog",
            assignedTo: null,
            interrupted: false,
            logs: [],
            description: `${issue.description || ""}\n\nLinear: ${issue.url}`
          });
          count++;
        }
      }
      addEvent(`[Linear Integration] Sincronizadas ${count} novas issues.`);
      broadcastState();
      return jsonResponse(res, 200, { ok: true, count });
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error("Linear Sync error:", err.message);
        return jsonResponse(res, 500, { error: err.message });
      }
      return jsonResponse(res, 500, { error: "Unknown error syncing Linear issues" });
    }
  }

  // POST /api/webhooks/trufflehog
  if (url === "/api/webhooks/trufflehog" && method === "POST") {
    const body = await parseBody(req);

    let description = "Vulnerability detected by Trufflehog.\n";
    if (body.DetectorName) description += `Detector: ${body.DetectorName}\n`;
    if (body.DecoderName) description += `Decoder: ${body.DecoderName}\n`;
    if (body.Raw) description += `Secret: [REDACTED]\n`;
    if ((body.SourceMetadata as any)?.Data?.Github?.file) description += `File: ${(body.SourceMetadata as any).Data.Github.file}\n`;
    if ((body.SourceMetadata as any)?.Data?.Github?.commit) description += `Commit: ${(body.SourceMetadata as any).Data.Github.commit}\n`;

    const title = `Trufflehog: ${body.DetectorName || "Secret"} vulnerability detected`;

    DB.createTask({
      title: title,
      source: "trufflehog",
      category: "security",
      priority: "alta",
      lane: "backlog",
      description: description
    });

    addEvent(`[Trufflehog] Criada tarefa de segurança de alta prioridade.`);
    broadcastState();
    return jsonResponse(res, 200, { ok: true });
  }

  // GET /api/analytics
  if (url === "/api/analytics" && method === "GET") {
    const tasks = DB.getTasks();
    const agents = DB.getAgents();

    const taskDistribution: Record<string, number> = {};
    const priorityDistribution: Record<string, number> = {};

    tasks.forEach(task => {
      taskDistribution[task.lane] = (taskDistribution[task.lane] || 0) + 1;
      priorityDistribution[task.priority] = (priorityDistribution[task.priority] || 0) + 1;
    });

    const agentUtilization: Record<string, number> = {};
    agents.forEach(agent => {
      const assignedTasks = tasks.filter(t => t.assignedTo === agent.id).length;
      agentUtilization[agent.id] = assignedTasks;
    });

    return jsonResponse(res, 200, {
      taskDistribution,
      priorityDistribution,
      agentUtilization,
      totalTasks: tasks.length,
      totalAgents: agents.length
    });
  }