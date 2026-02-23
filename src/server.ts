import { createServer } from "http";
import * as fs from "fs";
import * as path from "path";
import { execSync, exec } from "child_process";
import { Task, Agent, State, EventLog, LLMDriver } from "./types.js";
import { MockDriver } from "./drivers/MockDriver.js";
import { GeminiDriver } from "./drivers/GeminiDriver.js";
import { CopilotDriver } from "./drivers/CopilotDriver.js";
import { OpenCodeDriver } from "./drivers/OpenCodeDriver.js";
import { OpenAIDriver } from "./drivers/OpenAIDriver.js";
import { ClaudeDriver } from "./drivers/ClaudeDriver.js";
import { CommandDriver } from "./drivers/CommandDriver.js";
import { DB } from "./db.js";
import "dotenv/config";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5174;

// --- State and Persistence ---
const INITIAL_AGENTS: Agent[] = [
  { id: "pm", role: "Product Manager", model: "gpt-4o", category: "roadmap", status: "idle", assignedTask: null },
  { id: "sec", role: "Segurança", model: "gpt-4o", category: "security", status: "idle", assignedTask: null },
  { id: "perf", role: "Performance", model: "gpt-4o", category: "performance", status: "idle", assignedTask: null },
  { id: "func", role: "Novas Funcionalidades", model: "gpt-4o", category: "feature", status: "idle", assignedTask: null },
  { id: "tests", role: "Testes", model: "gpt-4o", category: "test", status: "idle", assignedTask: null },
  { id: "bug", role: "Correções / Bugs", model: "gpt-4o", category: "bug", status: "idle", assignedTask: null },
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

initializeState();

// SSE Clients
let clients: { id: number; res: any }[] = [];
let broadcastScheduled = false;
let lastBroadcastState = "";

// Helper to keep local state and DB in sync
function updateTask(id: number, updates: Partial<Task>) {
  const task = DB.getTask(id);
  if (!task) return;
  DB.updateTask(id, updates);
  scheduleBroadcast();
}

function updateAgent(id: string, updates: Partial<Agent>) {
  const agent = DB.getAgent(id);
  if (!agent) return;
  DB.updateAgent(id, updates);
  scheduleBroadcast();
}

function scheduleBroadcast() {
  if (broadcastScheduled) return;
  broadcastScheduled = true;
  setTimeout(() => {
    broadcastScheduled = false;
    broadcastState();
  }, 50);
}

function broadcastState() {
  const fullState = {
    tasks: DB.getTasks(),
    agents: DB.getAgents(),
    events: DB.getEvents()
  };
  const data = JSON.stringify(fullState);

  if (data === lastBroadcastState) return;
  lastBroadcastState = data;

  clients.forEach(client => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch (e) {
      console.error(`Error broadcasting to client ${client.id}:`, e);
    }
  });
}

function addEvent(text: string) {
  const timestamp = new Date().toLocaleTimeString("pt-BR");
  DB.addEvent(timestamp, text);
  scheduleBroadcast();
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
  const agents = DB.getAgents();
  const agentsById = new Map(agents.map(agent => [agent.id, agent]));
  const idleAgentsByCategory = new Map<string, Agent[]>();

  agents
    .filter(agent => agent.status === "idle")
    .forEach(agent => {
      const bucket = idleAgentsByCategory.get(agent.category) || [];
      bucket.push(agent);
      idleAgentsByCategory.set(agent.category, bucket);
    });

  for (const task of backlogTasks) {
    // 1. If manually assigned:
    if (task.assignedTo) {
      const assignedAgent = agentsById.get(task.assignedTo);
      if (assignedAgent && assignedAgent.status === "idle") {
        startTask(task, assignedAgent);
        assignedAgent.status = "working";
      }
      continue; // Stop here for explicitly assigned tasks (wait until agent is free)
    }

    // 2. Otherwise use basic heuristic: match category.
    const availableAgents = idleAgentsByCategory.get(task.category);
    const agent = availableAgents?.find(a => a.status === "idle");

    if (agent) {
      startTask(task, agent);
      agent.status = "working";
    }
  }
}

// Start Auto-Pilot loop (every 3 seconds)
setInterval(autoAssign, 3000);

// --- PM Auto-Create Logic ---
async function generateRoadmapTasks() {
  const backlogTasks = DB.getTasks().filter(t => t.lane === "backlog");

  // Only generate if we are running low on tasks
  if (backlogTasks.length >= 3) return;

  const prompt = `
    You are a Product Manager for a software project called "Vibe Kanban 3D".
    The project is a 3D Task Orchestrator with AI agents.
    Current roles: Product Manager, Security, Performance, Novas Funcionalidades, Testes, Correções / Bugs.

    Generate 2 realistic, high-value tasks for the backlog.
    Categories must be one of: "roadmap", "security", "performance", "feature", "test", "bug".
    Priorities: "alta", "media", "baixa".

    Return ONLY a JSON array with objects containing: title, category, priority, description.
    Example: [{"title": "Optimize 3D rendering", "category": "performance", "priority": "alta", "description": "Reduce draw calls..."}]
    Do not output markdown code blocks. Just the raw JSON string.
  `;

  const processTasks = (jsonStr: string) => {
      try {
          const cleanJson = jsonStr.replace(/```json/g, "").replace(/```/g, "").trim();
          const newTasks = JSON.parse(cleanJson);
          if (Array.isArray(newTasks)) {
              let count = 0;
              newTasks.forEach((t: any) => {
                  if (t.title && t.category) {
                      DB.createTask({
                          title: t.title,
                          source: "product_manager",
                          category: t.category,
                          priority: t.priority || "media",
                          lane: "backlog",
                          assignedTo: null,
                          interrupted: false,
                          logs: [],
                          description: t.description
                      });
                      count++;
                  }
              });
              if (count > 0) addEvent(`[PM] Adicionou ${count} novas tarefas ao backlog.`);
          }
      } catch (e) {
          console.error("PM Failed to parse JSON:", e);
      }
  };

  // 1. Try OpenAI if Key is present
  if (process.env.OPENAI_API_KEY) {
      try {
          const res = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
              },
              body: JSON.stringify({
                  model: "gpt-4o",
                  messages: [{ role: "system", content: prompt }]
              })
          });
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) processTasks(content);
      } catch (e) {
          console.error("PM OpenAI Auto-create failed:", e);
      }
      return;
  }

  // 2. Fallback to Gemini CLI
  if (isCommandAvailable("gemini")) {
      exec(`gemini -p '${prompt.replace(/'/g, "'\\''")}' -m gemini-2.0-flash --yolo`, (error, stdout, stderr) => {
          if (error) {
              console.error("PM Auto-create failed:", stderr);
              return;
          }
          processTasks(stdout);
      });
  }
}

// PM loop (every 60 seconds)
setInterval(generateRoadmapTasks, 60000);

const CONFIG_FILE = "vibe_config.json";
let appConfig = { cloneDir: "./clones" };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    appConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }
} catch (e) { }

function sanitizeCloneDir(input: unknown): string {
  if (typeof input !== "string") return "./clones";
  const trimmed = input.trim();
  if (!trimmed) return "./clones";

  return path.normalize(trimmed);
}

// --- Drivers ---
const cliDriver = new CommandDriver(() => appConfig.cloneDir);
const drivers: Record<string, LLMDriver> = {
  mock: new MockDriver(),
  gemini: new GeminiDriver(() => appConfig.cloneDir),
  copilot: new CopilotDriver(),
  opencode: new OpenCodeDriver(() => appConfig.cloneDir),
  claude: new ClaudeDriver(),
  openai: new OpenAIDriver(() => appConfig.cloneDir),
};

function isCommandAvailable(command: string): boolean {
  try {
    execSync(`${command} --version`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Keep the app functional even when Gemini CLI is not installed.
let currentDriver: LLMDriver = isCommandAvailable("gemini") ? drivers.gemini : drivers.mock;
if (currentDriver === drivers.mock) {
  addEvent("Gemini CLI não encontrado. Driver padrão alterado para Mock automaticamente.");
}

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
    appConfig.cloneDir = sanitizeCloneDir(body.cloneDir);
    fs.mkdirSync(appConfig.cloneDir, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2));
    addEvent(`Pasta padrão de clones alterada para: ${appConfig.cloneDir}`);
    return jsonResponse(res, 200, { cloneDir: appConfig.cloneDir });
  }

  if (method === "OPTIONS") return jsonResponse(res, 200, { ok: true });

  // GET /api/tools
  if (url === "/api/tools" && method === "GET") {
    const tools: { id: string; name: string }[] = [];
    tools.push({ id: "mock", name: "Mock Driver" });
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
      models = ["gemini-2.0-flash", "gemini-2.0-flash-lite-preview", "gemini-2.0-pro-exp-02-05", "gemini-2.0-flash-thinking-exp-01-21", "gemini-1.5-flash", "gemini-1.5-pro"];
    } else if (tool === "mock") {
      models = ["mock-model-v1", "mock-gpt-4", "mock-claude"];
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
    res.write(`data: ${JSON.stringify({ tasks: DB.getTasks(), agents: DB.getAgents(), events: DB.getEvents() })}\n\n`);

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

    const updatedTask = getTask(task.id);
    const updatedAgent = getAgent(agent.id);

    return jsonResponse(res, 200, { task: updatedTask, agent: updatedAgent });
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

  // POST /api/settings/env
  if (url === "/api/settings/env" && method === "POST") {
    const body = await parseBody(req);
    const envPath = path.resolve(process.cwd(), ".env");
    let envContent = "";

    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf-8");
      }
    } catch (e) { }

    const envLines = envContent.split("\n");
    const newKeys = Object.keys(body);

    newKeys.forEach(key => {
      const value = body[key];
      if (!value) return; // Skip empty values

      // Update process.env
      process.env[key] = value;

      // Update .env file content
      const regex = new RegExp(`^${key}=.*`, "m");
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        envContent += `\n${key}=${value}`;
      }
    });

    // Clean up multiple newlines
    envContent = envContent.replace(/\n\n+/g, "\n").trim();

    try {
      fs.writeFileSync(envPath, envContent);
      addEvent("Variáveis de ambiente atualizadas.");
      return jsonResponse(res, 200, { ok: true });
    } catch (e) {
      return jsonResponse(res, 500, { error: "Failed to write .env file" });
    }
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

  // POST /api/tasks/clear-done
  if (url === "/api/tasks/clear-done" && method === "POST") {
    DB.clearDoneTasks();
    addEvent("Tarefas concluídas foram limpas.");
    broadcastState();
    return jsonResponse(res, 200, { ok: true });
  }

  // Reset
  if (url === "/api/reset" && method === "POST") {
    DB.reset();
    INITIAL_AGENTS.forEach(agent => DB.saveAgent(agent));
    addEvent("Sistema resetado.");
    broadcastState();
    return jsonResponse(res, 200, { ok: true });
  }

  jsonResponse(res, 404, { error: "Not found" });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
