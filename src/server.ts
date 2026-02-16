import { createServer } from "http";

type Agent = {
  id: string;
  role: string;
  model: string;
  category: string;
  status: "idle" | "working";
  assignedTask?: number | null;
};

const agents: Agent[] = [];

function jsonResponse(res: any, status: number, body: any) {
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS,DELETE", "Access-Control-Allow-Headers": "Content-Type" });
  res.end(JSON.stringify(body));
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: any) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const { method, url } = req as any;
  if (method === "OPTIONS") return jsonResponse(res, 200, { ok: true });

  if (url === "/api/agents" && method === "GET") {
    return jsonResponse(res, 200, { agents });
  }

  if (url === "/api/agents" && method === "POST") {
    const body = await parseBody(req);
    if (!body?.id) return jsonResponse(res, 400, { error: "missing id" });
    const found = agents.find((a) => a.id === body.id);
    if (found) return jsonResponse(res, 409, { error: "agent exists" });
    const a: Agent = { id: body.id, role: body.role || "agent", model: body.model || "unknown", category: body.category || "misc", status: "idle", assignedTask: null };
    agents.push(a);
    return jsonResponse(res, 201, { agent: a });
  }

  if (url === "/api/assign" && method === "POST") {
    const body = await parseBody(req);
    const { taskId, category } = body || {};
    if (!taskId || !category) return jsonResponse(res, 400, { error: "missing taskId or category" });
    // find idle agent of category
    const agent = agents.find((a) => a.category === category && a.status === "idle");
    if (!agent) return jsonResponse(res, 404, { error: "no-agent-available" });
    agent.status = "working";
    agent.assignedTask = taskId;
    return jsonResponse(res, 200, { agent });
  }

  if (url && url.startsWith("/api/agents/") && method === "POST") {
    // e.g. /api/agents/{id}/complete
    const parts = url.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[2] === "complete") {
      const id = parts[1];
      const a = agents.find((x) => x.id === id);
      if (!a) return jsonResponse(res, 404, { error: "agent-not-found" });
      a.status = "idle";
      a.assignedTask = null;
      return jsonResponse(res, 200, { ok: true });
    }
  }

  if (url && url.startsWith("/api/agents/") && method === "DELETE") {
    const parts = url.split("/").filter(Boolean);
    const id = parts[1];
    const idx = agents.findIndex((x) => x.id === id);
    if (idx === -1) return jsonResponse(res, 404, { error: "agent-not-found" });
    agents.splice(idx, 1);
    return jsonResponse(res, 200, { ok: true });
  }

  jsonResponse(res, 404, { error: "not-found" });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 5174;
server.listen(PORT, () => console.log(`Agent manager listening on http://localhost:${PORT}`));
