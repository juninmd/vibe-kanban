import { createServer } from "http";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { execSync, exec } from "child_process";
import { Task, Agent, State, EventLog, LLMDriver } from "./types.js";
import { GeminiDriver } from "./drivers/GeminiDriver.js";
import { CopilotDriver } from "./drivers/CopilotDriver.js";
import { OpenCodeDriver } from "./drivers/OpenCodeDriver.js";
import { OpenAIDriver } from "./drivers/OpenAIDriver.js";
import { ClaudeDriver } from "./drivers/ClaudeDriver.js";
import { CommandDriver } from "./drivers/CommandDriver.js";
import { DB } from "./db.js";
import { TerminalManager } from "./terminal/TerminalManager.js";
import { Memory } from "./memory.js";
import { createPullRequest } from "./utils/githubUtils.js";
import { isCommandAvailable } from "./utils/commandUtils.js";
import { buildProviderChain, isEligibleForProviderFallback } from "./drivers/providerFallback.js";
import { getAvailableTools } from "./providers.js";
import { isEligibleForFallback } from "./utils/fallbackUtils.js";
import { prepareWorktree, cleanupWorktree } from "./utils/worktreeUtils.js";
import "dotenv/config";

const PORT = process.env.PORT ? Number(process.env.PORT) : 5174;

const CONFIG_FILE = "vibe_config.json";
let appConfig = { cloneDir: "./clones" };
try {
  if (fs.existsSync(CONFIG_FILE)) {
    appConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  }
} catch (e) { }

// --- State and Persistence ---
function initializeState(): State {
  return {
    tasks: DB.getTasks(),
    agents: DB.getAgents(),
    events: DB.getEvents()
  };
}

function initializeDefaultAgents() {
  const existing = DB.getAgents();
  if (existing.length === 0) {
    const defaults = [
      { role: "Product Manager", category: "roadmap", model: "gpt-4o", tool: "openai" },
      { role: "Segurança", category: "security", model: "gemini-2.0-flash", tool: "gemini" },
      { role: "Performance", category: "performance", model: "gpt-4o", tool: "copilot" },
      { role: "Novas Funcionalidades", category: "feature", model: "claude-3-5-sonnet-20241022", tool: "claude" },
      { role: "Testes", category: "test", model: "gpt-4o", tool: "opencode" },
      { role: "Novas Features", category: "feature", model: "gpt-4o", tool: "opencode" },
    ];

    defaults.forEach((def, idx) => {
      DB.saveAgent({
        id: `agent-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`,
        role: def.role,
        model: def.model,
        category: def.category,
        status: "idle",
        assignedTask: null,
        tool: def.tool,
        terminalId: `term-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`
      });
    });
    console.log("Initialized default agents.");
  }
}

initializeState();
initializeDefaultAgents();

// SSE Clients
let clients: { id: string; res: any }[] = [];
let broadcastScheduled = false;
let lastBroadcastState = "";

// --- Terminal Buffer (in-memory per agent, last 500 lines) ---
const terminalBuffers = new Map<string, { type: string; content: string; timestamp: number }[]>();
const TERMINAL_BUFFER_MAX = 500;

function addTerminalLine(agentId: string, taskId: number | null, type: string, content: string) {
  // In-memory buffer
  let buf = terminalBuffers.get(agentId);
  if (!buf) { buf = []; terminalBuffers.set(agentId, buf); }
  const entry = { type, content, timestamp: Date.now() };
  buf.push(entry);
  if (buf.length > TERMINAL_BUFFER_MAX) buf.shift();
  // Persist to DB
  DB.addTerminalLog(agentId, taskId, type, content);
  // Broadcast terminal update to SSE clients
  const termData = JSON.stringify({ terminalUpdate: { agentId, taskId, ...entry } });
  clients.forEach(c => { try { c.res.write(`data: ${termData}\n\n`); } catch (e) { } });
}

// Bug rate limiter & Fallback State
const bugCounts = new Map<number, number>();
const activeTaskDrivers = new Map<number, LLMDriver>();
const fallbackAttempts = new Map<number, number>();
const MAX_FALLBACK_ATTEMPTS = 3;

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

function resolveDriverForAgent(agent?: Agent | null): LLMDriver {
  if (agent?.tool && drivers[agent.tool]) {
    return drivers[agent.tool];
  }
  if (agent?.tool) return cliDriver;
  return currentDriver;
}

function releaseTaskAgent(task: Task): LLMDriver {
  const agent = task.assignedTo ? getAgent(task.assignedTo) : null;
  if (agent) {
    updateAgent(agent.id, { status: "idle", assignedTask: null });
  }
  return resolveDriverForAgent(agent);
}

// --- Helpers ---
function jsonResponse(res: any, status: number, body: any) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
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
async function startTask(task: Task, agent: Agent) {
  // 1. Immediately claim the task and agent to prevent race conditions during async worktree setup
  updateTask(task.id, {
    assignedTo: agent.id,
    lane: "in_progress",
    interrupted: false,
  });

  updateAgent(agent.id, {
    status: "working",
    assignedTask: task.id
  });

  let finalWorkDir = task.workDir || path.join(appConfig.cloneDir, `task-${task.id}`);
  let taskBaseRepoDir: string | undefined = undefined;

  // 2. Perform slow async Git worktree setup
  // 2. Perform slow async Git worktree setup
  // 2. Perform slow async Git worktree setup
  if (task.githubRepo) {
    try {
      const branchName = `feature/task-${task.id}`;
      addEvent(`[Worktree] Preparando isolamento para Tarefa #${task.id}...`);
      const wtInfo = await prepareWorktree(appConfig.cloneDir, task.githubRepo, branchName, process.env.GITHUB_TOKEN);
      finalWorkDir = wtInfo.worktreeDir;
      taskBaseRepoDir = wtInfo.baseRepoDir;
    } catch (err: any) {
      addEvent(`[Worktree Error] Falha ao preparar repositório para a Tarefa #${task.id}: ${err.message}`);
    }
  }

  // If worktree setup failed or was not applicable, ensure the fallback directory exists.
  // `prepareWorktree` is responsible for creating its own directory on success.
  if (!taskBaseRepoDir) {
    if (!fs.existsSync(finalWorkDir)) {
      fs.mkdirSync(finalWorkDir, { recursive: true });
    }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }
  }

  // 3. Update task with final directory info
  updateTask(task.id, {
    workDir: finalWorkDir,
    baseRepoDir: taskBaseRepoDir
  });

  // Refresh task object with new workDir
  const updatedTask = DB.getTask(task.id) || task;

  const attempt = (fallbackAttempts.get(task.id) || 0) + 1;
  const attemptStr = attempt > 1 ? ` (Tentativa de Fallback ${attempt}/${MAX_FALLBACK_ATTEMPTS})` : "";
  addEvent(`[AutoPilot] ${agent.role} iniciou a tarefa #${task.id}${attemptStr}`);
  addTerminalLine(agent.id, task.id, "system", `=== Tarefa #${task.id}: ${task.title}${attemptStr} ===`);

  const providerChain = buildProviderChain(agent, drivers);
  bugCounts.set(task.id, 0);

  setTimeout(() => {
    let attemptIndex = 0;

    const runAttempt = (tool: string) => {
const executeDriver = (Object.prototype.hasOwnProperty.call(drivers, tool) ? drivers[tool] : null) || resolveDriverForAgent(agent);
      const executionAgent = { ...agent, tool };
      activeTaskDrivers.set(task.id, executeDriver);
      addTerminalLine(agent.id, task.id, "system", `🤖 Provider: ${tool}`);

      executeDriver.executeTask(updatedTask, executionAgent, {
        onLog: (tid, msg) => {
      const t = getTask(tid);
      if (t) {
        const updatedLogs = [...t.logs, msg];
        updateTask(tid, { logs: updatedLogs });
        // Write to terminal buffer for the assigned agent
        if (t.assignedTo) {
          addTerminalLine(t.assignedTo, tid, "stdout", msg);
        }
        if (msg.includes("Error") || msg.includes("Completed")) addEvent(`#${tid}: ${msg}`);
      }
    },
    onComplete: async (tid) => {
      activeTaskDrivers.delete(tid);
      const t = getTask(tid);
      if (t && t.assignedTo) {
        addTerminalLine(t.assignedTo, tid, "system", `✅ Tarefa #${tid} concluída!`);

        // Reset fallback attempts on success
        fallbackAttempts.delete(tid);

        // Auto PR generation
        if (t.githubRepo && process.env.GITHUB_TOKEN) {
            addTerminalLine(t.assignedTo, tid, "system", `🔄 Gerando Pull Request para o repositório ${t.githubRepo}...`);
            try {
                const workDir = t.workDir || path.join(appConfig.cloneDir, `task-${t.id}`);
                const githubUser = process.env.GITHUB_USER || "vibe-agent";
                const prResult = await createPullRequest(workDir, t.id, t.title, t.githubRepo, process.env.GITHUB_TOKEN, githubUser);
                addTerminalLine(t.assignedTo, tid, "system", `✅ ${prResult}`);
                addEvent(`PR criado para Tarefa #${tid}: ${t.githubRepo}`);
            } catch (prError: any) {
                addTerminalLine(t.assignedTo, tid, "stderr", `❌ Falha ao criar Pull Request: ${prError.message}`);
                addEvent(`Erro ao criar PR para Tarefa #${tid}.`);
            }
        }

        if (t.baseRepoDir && t.workDir) {
            const branchName = `feature/task-${tid}`;
            try {
                await cleanupWorktree(t.baseRepoDir, t.workDir, branchName);
            } catch(e: any) {
                addEvent(`Erro ao limpar worktree para a Tarefa #${tid}: ${e.message}`);
            }
        }

        updateAgent(t.assignedTo, { status: "idle", assignedTask: null });
        updateTask(tid, { assignedTo: null, lane: "done" });
        addEvent(`Tarefa #${tid} concluída!`);
        bugCounts.delete(tid);
      }
    },
    onBugFound: (tid, desc) => {
      const nextTool = providerChain[attemptIndex + 1];
      if (nextTool && isEligibleForProviderFallback(desc)) {
        attemptIndex += 1;
        addEvent(`[ProviderFallback] Tarefa #${tid} falhou com ${providerChain[attemptIndex - 1]} (${desc}). Tentando ${nextTool}.`);
        runAttempt(nextTool);
        return;
      }

      activeTaskDrivers.delete(tid);
      const t = getTask(tid);
      if (!t) return;

      if (isEligibleForFallback(desc)) {
          const attempts = (fallbackAttempts.get(tid) || 0) + 1;
          fallbackAttempts.set(tid, attempts);

          if (attempts <= MAX_FALLBACK_ATTEMPTS) {
              addEvent(`[Fallback] Erro transiente em #${tid}: ${desc}. Tentando novamente... (${attempts}/${MAX_FALLBACK_ATTEMPTS})`);
              if (t.assignedTo) {
                  addTerminalLine(t.assignedTo, tid, "stderr", `⚠️ Erro transiente detectado. Acionando Fallback (${attempts}/${MAX_FALLBACK_ATTEMPTS}): ${desc}`);
                  updateAgent(t.assignedTo, { status: "idle", assignedTask: null });
                  updateTask(tid, { assignedTo: null, lane: "backlog", interrupted: true }); // Will be picked up again
              }
              return; // Stop normal bug flow
          } else {
              addEvent(`[Fallback] Falha na tarefa #${tid} após ${MAX_FALLBACK_ATTEMPTS} tentativas.`);
              if (t.assignedTo) {
                  addTerminalLine(t.assignedTo, tid, "stderr", `❌ Exaustão de provedor após ${MAX_FALLBACK_ATTEMPTS} tentativas: ${desc}`);
              }
              fallbackAttempts.delete(tid); // Clean up on ultimate failure
          }
      }

      // Normal Bug Flow
      // Rate limit: max 3 bugs per task
      const count = (bugCounts.get(tid) || 0) + 1;
      bugCounts.set(tid, count);
      if (count > 3) {
        console.warn(`Bug rate limit reached for task #${tid}`);
        return;
      }
      addEvent(`BUG encontrado em #${tid}: ${desc}`);
      if (t.assignedTo) {
        addTerminalLine(t.assignedTo, tid, "stderr", `❌ Bug: ${desc}`);
        updateAgent(t.assignedTo, { status: "idle", assignedTask: null });
        updateTask(tid, { assignedTo: null, lane: "backlog", interrupted: true });
      }
      // Only create bug task if under limit
      DB.createTask({
        title: `Bug: ${desc.substring(0, 100)}`,
        source: "system",
        category: "bug",
        priority: "alta",
        lane: "backlog",
        assignedTo: null,
        interrupted: false,
        logs: [],
      });
    },
    onInterrupt: (tid) => {
      const t = getTask(tid);
      if (t?.assignedTo) {
        addTerminalLine(t.assignedTo, tid, "system", `⏹️ Tarefa #${tid} interrompida`);
      }
    },
    memory: Memory.getInstance()
      }).catch((err: any) => {
        activeTaskDrivers.delete(updatedTask.id);
        addEvent(`Erro ao executar tarefa #${updatedTask.id}: ${err.message}`);
        if (agent.id) {
          updateAgent(agent.id, { status: "idle", assignedTask: null });
        }
        updateTask(updatedTask.id, { assignedTo: null, lane: "backlog", interrupted: true });
      });
    };

    try {
      const firstTool = providerChain[0] || agent.tool || "gemini";
      runAttempt(firstTool);
    } catch (err: any) {
      activeTaskDrivers.delete(updatedTask.id);
      addEvent(`Erro ao executar tarefa #${updatedTask.id}: ${err.message}`);
      if (agent.id) {
        updateAgent(agent.id, { status: "idle", assignedTask: null });
      }
      updateTask(updatedTask.id, { assignedTo: null, lane: "backlog", interrupted: true });
    }
  }, 0);
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
        startTask(task, assignedAgent).catch(console.error);
        assignedAgent.status = "working";
      }
      continue; // Stop here for explicitly assigned tasks (wait until agent is free)
    }

    // 2. Otherwise use basic heuristic: match category.
    const availableAgents = idleAgentsByCategory.get(task.category);
    const agent = availableAgents?.find(a => a.status === "idle");

    if (agent) {
      startTask(task, agent).catch(console.error);
      agent.status = "working";
    }
  }
}

// Auto-assign: skip system-generated tasks to prevent bug loops
let orchestrationEnabled = true;

setInterval(() => {
  if (orchestrationEnabled) {
    autoAssign();
  }
}, 3000);

// --- PM Auto-Create Logic ---
async function generateRoadmapTasks() {
  const backlogTasks = DB.getTasks().filter(t => t.lane === "backlog");
  if (backlogTasks.length >= 3) return;

  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    addEvent("[PM] API key não configurada. Configure OPENAI_API_KEY ou GEMINI_API_KEY nas configurações.");
    return;
  }

  const existingAgents = DB.getAgents();
  const roles = existingAgents.map(a => a.role).join(", ") || "Nenhum agente configurado";

  const prompt = `You are a Product Manager for "Vibe Kanban 3D", a 3D Task Orchestrator with AI agents.
Current agents: ${roles}.
Categories: "roadmap", "security", "performance", "feature", "test", "bug".
Priorities: "alta", "media", "baixa".
Generate 2 realistic tasks. Return ONLY a JSON array: [{"title":"...","category":"...","priority":"...","description":"..."}]`;

  const processTasks = (raw: string) => {
    try {
      // Try to extract JSON array from mixed text
      const arrayMatch = raw.match(/\[[\s\S]*?\]/);
      if (!arrayMatch) {
        console.warn("PM: No JSON array found in response");
        return;
      }
      const newTasks = JSON.parse(arrayMatch[0]);
      if (!Array.isArray(newTasks)) return;
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
    } catch (e) {
      console.warn("PM: Failed to parse response JSON");
    }
  };

  try {
    if (process.env.OPENAI_API_KEY) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "You generate JSON task arrays." },
            { role: "user", content: prompt }
          ]
        })
      });
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) processTasks(content);
    } else if (process.env.GEMINI_API_KEY) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) processTasks(content);
    }
  } catch (e) {
    console.warn("PM Auto-create failed:", e);
  }
}

// PM loop (every 60 seconds)
setInterval(generateRoadmapTasks, 60000);

function sanitizeCloneDir(input: unknown): string {
  if (typeof input !== "string") return "./clones";
  const trimmed = input.trim();
  if (!trimmed) return "./clones";

  return path.normalize(trimmed);
}

// --- Drivers ---
const terminalManager = new TerminalManager({
  onOutput: (agentId, data) => {
    // We can also broadcast this to specific clients if needed, 
    // but for now we'll use addTerminalLine for persistence and general broadcast.
    addTerminalLine(agentId, null, "stdout", data);
  },
  onExit: (agentId, code) => {
    addTerminalLine(agentId, null, "system", `Terminal exited with code ${code}`);
  }
});

const cliDriver = new CommandDriver(() => appConfig.cloneDir, terminalManager);
const drivers: Record<string, LLMDriver> = {
  gemini: new GeminiDriver(() => appConfig.cloneDir),
  copilot: new CopilotDriver(),
  opencode: new OpenCodeDriver(() => appConfig.cloneDir),
  claude: new ClaudeDriver(),
  openai: new OpenAIDriver(() => appConfig.cloneDir),
};

// Keep the app functional even when Gemini CLI is not installed.
let currentDriver: LLMDriver = drivers.gemini;
if (!isCommandAvailable("gemini")) {
  addEvent("Aviso: Gemini CLI não encontrado. Driver padrão definido como Gemini, mas pode falhar sem a CLI instalada.");
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

  // GET /api/tools
  if (url === "/api/tools" && method === "GET") {
    return jsonResponse(res, 200, { tools: getAvailableTools() });
  }

  // GET /api/models?tool=xxx
  if (url.startsWith("/api/models") && method === "GET") {
    const urlObj = new URL(url as string, `http://${req.headers?.host || "localhost"}`);
    const tool = urlObj.searchParams.get("tool") || undefined;

    let models: string[] = [];

    // 1) Tentar descoberta dinâmica via driver (CLI/API reais)
    if (tool && drivers[tool] && typeof drivers[tool].listModels === "function") {
      try {
        models = await drivers[tool].listModels();
      } catch (e) {
        console.warn(`listModels failed for tool ${tool}:`, e);
      }
    }

    // 2) Fallback estático apenas se não conseguimos nada dinâmico
    if (!models || models.length === 0) {
      if (tool === "gemini") {
        models = ["gemini-2.0-flash", "gemini-2.0-flash-lite-preview", "gemini-2.0-pro-exp-02-05", "gemini-2.0-flash-thinking-exp-01-21", "gemini-1.5-flash", "gemini-1.5-pro"];
      } else if (tool === "claude") {
        models = ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"];
      } else if (tool === "copilot") {
        models = ["gpt-4o", "gpt-4o-mini"];
      } else if (tool === "opencode") {
        models = ["gpt-4o", "claude-sonnet-4-20250514"];
      } else if (tool === "openai") {
        models = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"];
      }
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

  // PUT /api/agents/:id (Edit agent)
  if (url.startsWith("/api/agents/") && method === "PUT") {
    const agentId = decodeURIComponent(url.split("/api/agents/")[1]);
    const existing = DB.getAgent(agentId);
    if (!existing) return jsonResponse(res, 404, { error: "Agent not found" });
    const body = await parseBody(req);
    const updates: Partial<Agent> = {};
    if (body.role !== undefined) updates.role = body.role;
    if (body.model !== undefined) updates.model = body.model;
    if (body.category !== undefined) updates.category = body.category;
    if (body.tool !== undefined) updates.tool = body.tool;
    DB.updateAgent(agentId, updates);
    addEvent(`Agente atualizado: ${body.role || existing.role}`);
    broadcastState();
    return jsonResponse(res, 200, { agent: DB.getAgent(agentId) });
  }

  // DELETE /api/agents/:id (Delete agent)
  if (url.startsWith("/api/agents/") && method === "DELETE") {
    const agentId = decodeURIComponent(url.split("/api/agents/")[1]);
    const existing = DB.getAgent(agentId);
    if (!existing) return jsonResponse(res, 404, { error: "Agent not found" });
    // Release any assigned task
    if (existing.assignedTask) {
      const task = DB.getTask(existing.assignedTask);
      if (task) {
        const driver = resolveDriverForAgent(existing);
        driver.interruptTask(task);
        updateTask(task.id, { assignedTo: null, lane: "backlog", interrupted: true });
      }
    }
    DB.deleteAgent(agentId);
    addEvent(`Agente removido: ${existing.role}`);
    broadcastState();
    return jsonResponse(res, 200, { ok: true });
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

    const clientId = crypto.randomUUID();
    clients.push({ id: clientId, res });

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

  // GET /api/tasks/:id/terminal
  if (url.match(/^\/api\/tasks\/[^/]+\/terminal$/) && method === "GET") {
    const taskId = Number(url.split("/api/tasks/")[1].replace("/terminal", ""));
    const logs = DB.getTaskTerminalLogs(taskId);
    return jsonResponse(res, 200, { logs });
  }

  // POST /api/tasks/:id/open-folder
  if (url.match(/^\/api\/tasks\/[^/]+\/open-folder$/) && method === "POST") {
    const taskId = Number(url.split("/api/tasks/")[1].replace("/open-folder", ""));
    const task = DB.getTask(taskId);
    if (!task || !task.workDir) {
      return jsonResponse(res, 404, { error: "Task or workDir not found" });
    }

    const command = process.platform === "win32" ? `explorer "${task.workDir}"` : (process.platform === "darwin" ? `open "${task.workDir}"` : `xdg-open "${task.workDir}"`);
    exec(command);
    addEvent(`Abrindo pasta da tarefa #${taskId}: ${task.workDir}`);
    return jsonResponse(res, 200, { ok: true });
  }

  // GET /api/agents/:id/terminal
  if (url.match(/^\/api\/agents\/[^/]+\/terminal$/) && method === "GET") {
    const agentId = decodeURIComponent(url.split("/api/agents/")[1].replace("/terminal", ""));
    // Prefer in-memory buffer, fallback to DB
    const memLogs = terminalBuffers.get(agentId);
    const logs = memLogs && memLogs.length > 0 ? memLogs : DB.getTerminalLogs(agentId).reverse();
    return jsonResponse(res, 200, { logs });
  }

  // DELETE /api/agents/:id/terminal
  if (url.match(/^\/api\/agents\/[^/]+\/terminal$/) && method === "DELETE") {
    const agentId = decodeURIComponent(url.split("/api/agents/")[1].replace("/terminal", ""));
    terminalBuffers.delete(agentId);
    DB.clearTerminalLogs(agentId);
    addEvent(`Logs do terminal do agente ${agentId} limpos.`);
    return jsonResponse(res, 200, { ok: true });
  }

  // --- Terminal PTY Endpoints ---

  // GET /api/terminals
  if (url === "/api/terminals" && method === "GET") {
    return jsonResponse(res, 200, { terminals: terminalManager.listActive() });
  }

  // POST /api/terminals/:agentId/start
  if (url.match(/^\/api\/terminals\/[^/]+\/start$/) && method === "POST") {
    const agentId = decodeURIComponent(url.split("/api/terminals/")[1].replace("/start", ""));
    const agent = DB.getAgent(agentId);
    if (!agent) return jsonResponse(res, 404, { error: "Agent not found" });

    const body = await parseBody(req);
    try {
      const info = await terminalManager.create({
        agentId,
        cwd: body.cwd || appConfig.cloneDir || process.cwd(),
        cols: body.cols || 120,
        rows: body.rows || 30,
        env: body.env
      });
      return jsonResponse(res, 200, info);
    } catch (e: any) {
      return jsonResponse(res, 500, { error: e.message });
    }
  }

  // POST /api/terminals/:agentId/send
  if (url.match(/^\/api\/terminals\/[^/]+\/send$/) && method === "POST") {
    const agentId = decodeURIComponent(url.split("/api/terminals/")[1].replace("/send", ""));
    const body = await parseBody(req);
    try {
      terminalManager.write(agentId, body.data || "");
      return jsonResponse(res, 200, { ok: true });
    } catch (e: any) {
      return jsonResponse(res, 404, { error: e.message });
    }
  }

  // POST /api/terminals/:agentId/resize
  if (url.match(/^\/api\/terminals\/[^/]+\/resize$/) && method === "POST") {
    const agentId = decodeURIComponent(url.split("/api/terminals/")[1].replace("/resize", ""));
    const body = await parseBody(req);
    terminalManager.resize(agentId, body.cols || 120, body.rows || 30);
    return jsonResponse(res, 200, { ok: true });
  }

  // POST /api/terminals/:agentId/kill
  if (url.match(/^\/api\/terminals\/[^/]+\/kill$/) && method === "POST") {
    const agentId = decodeURIComponent(url.split("/api/terminals/")[1].replace("/kill", ""));
    await terminalManager.kill(agentId);
    return jsonResponse(res, 200, { ok: true });
  }

  // POST /api/tasks (Create task)
  if (url === "/api/tasks" && method === "POST") {
    const body = await parseBody(req);
    // Resolve workDir
    let workDir = body.workDir || null;
    if (workDir) {
      workDir = path.resolve(workDir);
      if (!fs.existsSync(workDir)) {
        fs.mkdirSync(workDir, { recursive: true });
      }
    }
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
      workDir,
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

    await startTask(task, agent);

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
      const executeDriver = activeTaskDrivers.get(task.id) || releaseTaskAgent(task);
      activeTaskDrivers.delete(task.id);
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
        const executeDriver = activeTaskDrivers.get(task.id) || releaseTaskAgent(task);
        activeTaskDrivers.delete(task.id);
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
    const ALLOWED_ENV_KEYS = ["OPENAI_API_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "GITHUB_USER", "GITHUB_TOKEN"];

    try {
      if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, "utf-8");
      }
    } catch (e) { }

    const newKeys = Object.keys(body).filter(k => ALLOWED_ENV_KEYS.includes(k));

    newKeys.forEach(key => {
      const value = body[key];
      if (!value) return;

      process.env[key] = value;

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

  // POST /api/orchestrator/config (Enable/disable auto-assignment)
  if (url === "/api/orchestrator/config" && method === "POST") {
    const body = await parseBody(req);
    if (typeof body.enabled === "boolean") {
      orchestrationEnabled = body.enabled;
      addEvent(`Orquestração automática ${orchestrationEnabled ? "ativada" : "desativada"}.`);
      return jsonResponse(res, 200, { enabled: orchestrationEnabled });
    }
    return jsonResponse(res, 400, { error: "Invalid body. Expected { enabled: boolean }" });
  }

  // POST /api/orchestrator/run (Manually trigger assignment logic)
  if (url === "/api/orchestrator/run" && method === "POST") {
    autoAssign();
    addEvent("Orquestração manual executada via API.");
    return jsonResponse(res, 200, { ok: true });
  }

  // Reset
  if (url === "/api/reset" && method === "POST") {
    DB.reset();
    initializeDefaultAgents();
    addEvent("Sistema resetado.");
    broadcastState();
    return jsonResponse(res, 200, { ok: true });
  }

  jsonResponse(res, 404, { error: "Not found" });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
