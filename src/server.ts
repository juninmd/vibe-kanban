import { createServer } from "http";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Task, Agent, State, EventLog, LLMDriver } from "./types.js";
import { MockDriver } from "./drivers/MockDriver.js";
import { GeminiDriver } from "./drivers/GeminiDriver.js";
import { CopilotDriver } from "./drivers/CopilotDriver.js";
import { OpenCodeDriver } from "./drivers/OpenCodeDriver.js";
import { ClaudeDriver } from "./drivers/ClaudeDriver.js";
import { CommandDriver } from "./drivers/CommandDriver.js";
import { DB } from "./db.js";
import "dotenv/config";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5174;

// --- State and Persistence ---
const INITIAL_AGENTS: Agent[] = [
  { id: "pm", role: "Product Manager", model: "gpt-4.1", category: "roadmap", status: "idle", assignedTask: null },
  { id: "sec", role: "Segurança", model: "o3-mini", category: "seguranca", status: "idle", assignedTask: null },
  { id: "perf", role: "Performance", model: "gpt-4o", category: "performance", status: "idle", assignedTask: null },
  { id: "func", role: "Novas Funcionalidades", model: "gpt-4.1-mini", category: "funcionalidades", status: "idle", assignedTask: null },
  { id: "tests", role: "Testes", model: "o1", category: "testes", status: "idle", assignedTask: null },
  { id: "feat", role: "Novas Features", model: "codex-mini", category: "features", status: "idle", assignedTask: null },
];

function initializeState(): State {
  let agents = DB.getAgents();
  if (agents.length === 0) {
    INITIAL_AGENTS.forEach(agent => DB.saveAgent(agent));
    agents = DB.getAgents();
  }

  return {
    tasks: DB.getTasks(),
    agents: agents,
    events: DB.getEvents()
  };
}

const state = initializeState();

// SSE Clients
let clients: { id: number; res: any }[] = [];

// Helper to keep local state and DB in sync
function updateTask(id: number, updates: Partial<Task>) {
  const task = state.tasks.find(t => t.id === id);
  if (task) {
    Object.assign(task, updates);
    DB.updateTask(id, updates);
    broadcastState();
  }
}

function updateAgent(id: string, updates: Partial<Agent>) {
  const agent = state.agents.find(a => a.id === id);
  if (agent) {
    Object.assign(agent, updates);
    DB.updateAgent(id, updates);
    broadcastState();
  }
}

function broadcastState() {
  const fullState = {
    tasks: DB.getTasks(),
    agents: DB.getAgents(),
    events: DB.getEvents()
  };
  const data = JSON.stringify(fullState);
  clients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch (e) {
      console.error(`Error broadcasting to client ${client.id}:`, e);
    }
  });
}

// Driver selection
const drivers: Record<string, LLMDriver> = {
  mock: new MockDriver(),
  gemini: new GeminiDriver(),
  copilot: new CopilotDriver(),
  opencode: new OpenCodeDriver(),
  claude: new ClaudeDriver(),
};
// Default to OpenCodeDriver as requested, falling back to mock behavior internally if CLI missing
let currentDriver: LLMDriver = drivers.opencode;

function addEvent(text: string) {
  const timestamp = new Date().toLocaleTimeString("pt-BR");
  DB.addEvent(timestamp, text);
  broadcastState();
}

function getTask(id: number) { return DB.getTask(id); }
function getAgent(id: string) { return DB.getAgent(id); }

// --- Helpers ---
function jsonResponse(res: any, status: number, body: any) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS,DELETE",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(body));
}

function parseBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk: any) => (data += chunk));
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); }
    });
  });
}

// --- Auto-Pilot Logic ---
function startTask(task: Task, agent: Agent) {
  updateTask(task.id, {
    assignedTo: agent.id,
    lane: "in_progress",
    interrupted: false
  });
  updateAgent(agent.id, {
    status: "working",
    assignedTask: task.id
  });
  addEvent(`[AutoPilot] ${agent.role} iniciou a tarefa #${task.id}`);

  let executeDriver = agent.tool ? cliDriver : currentDriver;

  // Execute via Driver
  executeDriver.executeTask(task, agent, {
    onLog: (tid, msg) => {
      const t = getTask(tid);
      if (t) {
        const updatedLogs = [...t.logs, msg];
        updateTask(tid, { logs: updatedLogs });
        if (msg.includes("Error") || msg.includes("Completed")) addEvent(`#${tid}: ${msg}`);
      }
    },
    onComplete: (tid) => {
      const t = getTask(tid);
      if (t && t.assignedTo) {
        updateAgent(t.assignedTo, { status: "idle", assignedTask: null });
        updateTask(tid, { assignedTo: null, lane: "done" });
        addEvent(`Tarefa #${tid} concluída!`);
      }
    },
    onBugFound: (tid, desc) => {
      const t = getTask(tid);
      if (t) {
        addEvent(`BUG encontrado em #${tid}: ${desc}`);
        const bugTask = DB.createTask({
          title: `Bug: ${desc}`,
          source: "system",
          category: "testes",
          priority: "alta",
          lane: "backlog",
          assignedTo: null,
          interrupted: false,
          logs: [],
        });
        if (t.assignedTo) {
          updateAgent(t.assignedTo, { status: "idle", assignedTask: null });
          updateTask(tid, { assignedTo: null, lane: "backlog", interrupted: true });
        }
      }
    },
    onInterrupt: (tid) => { }
  });
}

function autoAssign() {
  const backlogTasks = DB.getTasks().filter(t => t.lane === "backlog");
  if (backlogTasks.length === 0) return;

  backlogTasks.forEach(task => {
    // 1. If manually assigned:
    if (task.assignedTo) {
      const assignedAgent = getAgent(task.assignedTo);
      if (assignedAgent && assignedAgent.status === "idle") {
        startTask(task, assignedAgent);
      }
      return; // Stop here for explicitly assigned tasks (wait until agent is free)
    }

    // 2. Otherwise use basic heuristic: match category.
    const agents = DB.getAgents();
    const agent = agents.find(a =>
      a.status === "idle" && (a.category === task.category)
    );

    if (agent) {
      startTask(task, agent);
    }
  });
}

// Start Auto-Pilot loop (every 3 seconds)
setInterval(autoAssign, 3000);

// --- PM Auto-Create Logic ---
function pmAutoCreateLoop() {
  const backlogTasks = DB.getTasks().filter(t => t.lane === "backlog");
  // If backlog is running low, PM creates new tasks
  if (backlogTasks.length < 3) {
    const categories = ["roadmap", "seguranca", "performance", "funcionalidades", "features"];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    const task = DB.createTask({
      title: `Feature backlog item ${Date.now().toString().slice(-4)}`,
      source: "product_manager",
      category: randomCategory,
      priority: Math.random() > 0.7 ? "alta" : "media",
      lane: "backlog",
      assignedTo: null,
      interrupted: false,
      logs: [],
    });
    addEvent(`[PM] Novo card criado: ${task.title}`);
  }
}

// PM loop (every 10 seconds)
setInterval(pmAutoCreateLoop, 10000);

const CONFIG_FILE = "vibe_config.json";
let appConfig = { cloneDir: "./clones" };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    appConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }
} catch (e) { }

// --- Server ---
const cliDriver = new CommandDriver(() => appConfig.cloneDir);

const server = createServer(async (req, res) => {
  const { method, url } = req as any;

  if (!url) return;

  // Serve static files
  if (method === "GET" && !url.startsWith("/api")) {
    let filePath = "." + url;
    if (filePath === "./") filePath = "./index.html";

    // Prevent directory traversal
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.startsWith("..")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const extname = path.extname(filePath);
    let contentType = "text/html";
    switch (extname) {
      case ".js":
        contentType = "text/javascript";
        break;
      case ".css":
        contentType = "text/css";
        break;
      case ".json":
        contentType = "application/json";
        break;
      case ".png":
        contentType = "image/png";
        break;
      case ".jpg":
        contentType = "image/jpg";
        break;
      case ".svg":
        contentType = "image/svg+xml";
        break;
      case ".glb":
        contentType = "model/gltf-binary";
        break;
    }

    fs.readFile(filePath, (error, content) => {
      if (error) {
        if (error.code == "ENOENT") {
          jsonResponse(res, 404, { error: "Not found" });
        } else {
          res.writeHead(500);
          res.end("Sorry, check with the site admin for error: " + error.code + " ..\n");
        }
      } else {
        res.writeHead(200, { "Content-Type": contentType });
        res.end(content, "utf-8");
      }
    });
    return;
  }

  if (method === "OPTIONS") return jsonResponse(res, 200, { ok: true });

  // GET /api/config/clone-dir
  if (url === "/api/config/clone-dir" && method === "GET") {
    return jsonResponse(res, 200, { cloneDir: appConfig.cloneDir });
  }

  // POST /api/config/clone-dir
  if (url === "/api/config/clone-dir" && method === "POST") {
    const body = await parseBody(req);
    appConfig.cloneDir = body.cloneDir || "./clones";
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
    addEvent(`Pasta padrão de clones alterada para: ${appConfig.cloneDir}`);
    return jsonResponse(res, 200, { cloneDir: appConfig.cloneDir });
  }

  if (method === "OPTIONS") return jsonResponse(res, 200, { ok: true });

  // GET /api/tools
  if (url === "/api/tools" && method === "GET") {
    const tools: { id: string; name: string }[] = [];
    try {
      execSync("gemini --version", { stdio: "ignore" });
      tools.push({ id: "gemini", name: "Gemini CLI" });
    } catch { }
    try {
      execSync("ollama --version", { stdio: "ignore" });
      tools.push({ id: "ollama", name: "Ollama" });
    } catch { }
    return jsonResponse(res, 200, { tools });
  }

  // GET /api/models?tool=xxx
  if (url.startsWith("/api/models") && method === "GET") {
    const urlObj = new URL(url as string, `http://${req.headers?.host || "localhost"}`);
    const tool = urlObj.searchParams.get("tool");
    let models: string[] = [];
    if (tool === "ollama") {
      try {
        const output = execSync("ollama list").toString();
        const lines = output.split('\n').slice(1).filter(l => l.trim().length > 0);
        models = lines.map(l => l.split(/\s+/)[0]);
      } catch { }
    } else if (tool === "gemini") {
      models = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash-thinking-exp-01-21", "gemini-2.5-pro-exp", "gemini-2.5-flash-exp"];
    }
    return jsonResponse(res, 200, { models });
  }

  // POST /api/agents (Create dynamic agent)
  if (url === "/api/agents" && method === "POST") {
    const body = await parseBody(req);
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      role: body.role || "Assistente",
      model: body.model || "default",
      category: body.category || "misc",
      status: "idle",
      assignedTask: null,
      tool: body.tool,
      terminalId: `term-${Date.now()}`
    };
    DB.saveAgent(newAgent);
    addEvent(`Novo agente criado: ${newAgent.role} (${newAgent.tool} - ${newAgent.model})`);
    broadcastState();
    return jsonResponse(res, 201, { agent: newAgent });
  }

  // GET /api/events (SSE)
  if (url === "/api/events" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    // Send initial state
    res.write(`data: ${JSON.stringify(state)}\n\n`);

    const clientId = Date.now();
    const newClient = {
      id: clientId,
      res
    };
    clients.push(newClient);

    req.on("close", () => {
      clients = clients.filter(c => c.id !== clientId);
    });
    return;
  }

  // GET /api/state
  if (url === "/api/state" && method === "GET") {
    return jsonResponse(res, 200, {
      tasks: DB.getTasks(),
      agents: DB.getAgents(),
      events: DB.getEvents()
    });
  }

  // POST /api/tasks (Create task)
  if (url === "/api/tasks" && method === "POST") {
    const body = await parseBody(req);
    const task = DB.createTask({
      title: body.title,
      source: body.source || "user",
      category: body.category || "misc",
      priority: body.priority || "media",
      lane: "backlog",
      assignedTo: null,
      interrupted: false,
      logs: [],
      githubRepo: body.githubRepo,
      description: body.description,
      agentType: body.agentType,
    });
    addEvent(`Novo card criado: ${task.title} (${task.source})`);
    return jsonResponse(res, 201, { task });
  }

  // POST /api/assign (Assign task to agent)
  if (url === "/api/assign" && method === "POST") {
    const body = await parseBody(req);
    const { taskId, agentId } = body;
    const task = getTask(taskId);
    const agent = agentId ? getAgent(agentId) : DB.getAgents().find(a => a.category === task?.category && a.status === "idle");

    if (!task) return jsonResponse(res, 404, { error: "Task not found" });
    if (!agent) return jsonResponse(res, 404, { error: "No available agent" });

    startTask(task, agent);
    return jsonResponse(res, 200, { task: getTask(taskId), agent: getAgent(agent.id) });
  }

  // POST /api/interrupt
  if (url === "/api/interrupt" && method === "POST") {
    const { taskId } = await parseBody(req);
    const task = getTask(taskId);
    if (!task) return jsonResponse(res, 404, { error: "Task not found" });

    if (task.assignedTo) {
      const agent = getAgent(task.assignedTo);
      let executeDriver = currentDriver;
      if (agent) {
        updateAgent(agent.id, { status: "idle", assignedTask: null });
        if (agent.tool) executeDriver = cliDriver;
      }
      // Stop driver
      executeDriver.interruptTask(task);
      updateTask(task.id, { assignedTo: null, lane: "backlog", interrupted: true });
      addEvent(`Tarefa #${taskId} interrompida.`);
    }
    return jsonResponse(res, 200, { task: getTask(taskId) });
  }

  // POST /api/move
  if (url === "/api/move" && method === "POST") {
    const { taskId, lane } = await parseBody(req);
    const task = getTask(taskId);
    if (!task) return jsonResponse(res, 404, { error: "Task not found" });

    // If moving out of in_progress, interrupt/finish logic
    if (task.lane === "in_progress" && lane !== "in_progress") {
      if (task.assignedTo) {
        const agent = getAgent(task.assignedTo);
        let executeDriver = currentDriver;
        if (agent) {
          updateAgent(agent.id, { status: "idle", assignedTask: null });
          if (agent.tool) executeDriver = cliDriver;
        }
        executeDriver.interruptTask(task);
        updateTask(task.id, { assignedTo: null });
      }
    }
    updateTask(task.id, { lane });
    return jsonResponse(res, 200, { task: getTask(taskId) });
  }

  // POST /api/reorder (Move task up/down in priority/list)
  if (url === "/api/reorder" && method === "POST") {
    const { taskId, direction } = await parseBody(req);
    const task = getTask(taskId);
    if (!task) return jsonResponse(res, 404, { error: "Task not found" });

    const allTasks = DB.getTasks();
    const laneTasks = allTasks.filter(t => t.lane === task.lane);
    const currentIndex = laneTasks.findIndex(t => t.id === task.id);
    const targetIndex = currentIndex + direction;

    if (targetIndex >= 0 && targetIndex < laneTasks.length) {
      const otherTask = laneTasks[targetIndex];
      // Note: Reordering in SQLite might need a 'position' column for better results,
      // but here we just swap their timestamps or IDs if they were sequential.
      // For now, we'll just swap their updatedAt to affect the sort order if using that.
      const tempTime = task.updatedAt;
      updateTask(task.id, { updatedAt: otherTask.updatedAt });
      updateTask(otherTask.id, { updatedAt: tempTime });
      addEvent(`Prioridade reordenada no card #${taskId}`);
    }

    return jsonResponse(res, 200, { tasks: DB.getTasks() });
  }

  // POST /api/config
  if (url === "/api/config" && method === "POST") {
    const { driver } = await parseBody(req);
    if (drivers[driver]) {
      currentDriver = drivers[driver];
      addEvent(`Driver alterado para: ${currentDriver.name}`);
      return jsonResponse(res, 200, { driver: currentDriver.name });
    }
    return jsonResponse(res, 400, { error: "Invalid driver" });
  }

  // Reset
  if (url === "/api/reset" && method === "POST") {
    DB.reset();
    INITIAL_AGENTS.forEach(agent => DB.saveAgent(agent));
    addEvent("Sistema resetado.");
    broadcastState();
    return jsonResponse(res, 200, { ok: true });
  }

  // Static File Serving
  if (method === "GET") {
    let filePath = "";
    if (url === "/" || url === "/index.html") filePath = "index.html";
    else if (url === "/styles.css") filePath = "styles.css";
    else if (url.startsWith("/dist/")) filePath = url.substring(1);

    if (filePath) {
      const ext = path.extname(filePath);
      const contentTypes: Record<string, string> = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript"
      };

      try {
        const content = await fs.promises.readFile(filePath);
        res.writeHead(200, { "Content-Type": contentTypes[ext] || "text/plain" });
        res.end(content);
        return;
      } catch (e) {
        // Fall through to 404
      }
    }
  }

  jsonResponse(res, 404, { error: "Not found" });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
