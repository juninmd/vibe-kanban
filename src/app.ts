import { playTone, playSuccessSound, playErrorSound, playClickSound } from "./utils/ui/sound.js";
import { showToast } from "./utils/ui/toast.js";
import { els } from "./utils/ui/dom.js";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createOffice } from "./office.js";
import { getLaneSafe, getTaskCardPosition, shouldRenderTaskIn3D } from "./kanbanMath.js";
import { getHeadMaterials, getBodyMaterials, getLimbMaterial } from "./skins.js";
import { State } from "./types.js";

const API_URL = "";

type Agent = {
  id: string;
  role: string;
  model: string;
  category: string;
  status: "idle" | "working" | "error";
  assignedTask: number | null;
  tool?: string;
};

type Task = {
  id: number;
  title: string;
  source: string;
  category: string;
  priority: string;
  lane: string;
  assignedTo: string | null;
  interrupted?: boolean;
  logs?: string[];
  githubRepo?: string;
  description?: string;
  agentType?: string;
  model?: string;
  workDir?: string;
};

type EventLog = {
  timestamp: string;
  text: string;
};

type TaskTerminalLog = {
  agentId?: string;
  taskId: number | null;
  type: string;
  content: string;
  timestamp: number;
};

const lanes = ["backlog", "in_progress", "review", "done"];
const laneLabels: Record<string, string> = {
  backlog: "Backlog",
  in_progress: "Em progresso",
  review: "Review",
  done: "Concluído",
};

let agents: Agent[] = [];
let tasks: Task[] = [];
let eventLog: EventLog[] = [];
let previousTaskState = new Map<number, { lane: string; assignedTo: string | null }>(); // Para rastrear mudanças e detectar transições
let renderQueued = false;
let stateUpdateQueued = false;
let pendingStateData: State | null = null;
let lastUpdateTimestamp = 0;
const STATE_DEBOUNCE_MS = 100; // Debounce state updates to prevent UI freeze
let activeTaskDetailsId: number | null = null;
let activeTaskLogKeys = new Set<string>();


// --- Toast System ---


// --- Sound System ---
const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();


// --- Dashboard Logic ---
function updateDashboard() {
  const pending = tasks.filter(t => t.lane !== "done").length;
  const done = tasks.filter(t => t.lane === "done").length;
  const activeAgents = agents.filter(a => a.status === "working").length;

  if (els.statPending) els.statPending.textContent = pending.toString();
  if (els.statDone) els.statDone.textContent = done.toString();
  if (els.statAgents) els.statAgents.textContent = activeAgents.toString();
  if (els.headerStats) els.headerStats.textContent = `• ${pending} tarefas ativas`;
  document.title = `(${pending}) Vibe Kanban 3D`;
}

function normalizeRepoLink(repo?: string) {
  const value = repo?.trim() || "";
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://github.com/${value.replace(/^github\.com\//i, "").replace(/^\/+/, "")}`;
}

function inferTaskDraft(input: string) {
  const lowerInput = input.toLowerCase();
  let category = "feature";
  let priority = "media";

  if (lowerInput.includes("bug") || lowerInput.includes("erro") || lowerInput.includes("fix") || lowerInput.includes("corrigir")) category = "bug";
  else if (lowerInput.includes("teste") || lowerInput.includes("qa") || lowerInput.includes("verificar")) category = "test";
  else if (lowerInput.includes("performance") || lowerInput.includes("otimizar") || lowerInput.includes("lento") || lowerInput.includes("rápido")) category = "performance";
  else if (lowerInput.includes("segurança") || lowerInput.includes("vulnerabilidade") || lowerInput.includes("auth")) category = "security";
  else if (lowerInput.includes("planejar") || lowerInput.includes("roadmap")) category = "roadmap";

  if (lowerInput.includes("urgente") || lowerInput.includes("crítico") || lowerInput.includes("alta prioridade") || lowerInput.includes("p0")) priority = "alta";
  else if (lowerInput.includes("baixa prioridade") || lowerInput.includes("p3")) priority = "baixa";

  return {
    title: input,
    category,
    priority,
    description: `Gerado via preenchimento assistido: ${input}`,
  };
}

function resetTaskForm() {
  els.form.reset();
  els.source.value = "usuario";
  els.category.value = "feature";
  els.priority.value = "media";
  els.agentType.value = "";
  els.agentAssign.value = "";
  els.agentModel.innerHTML = '<option value="">Selecione um agente ou ferramenta</option>';
}

function openTaskCreateModal(draft: Partial<Record<string, string>> = {}) {
  resetTaskForm();
  if (draft.source) els.source.value = draft.source;
  if (draft.title) els.title.value = draft.title;
  if (draft.category) els.category.value = draft.category;
  if (draft.priority) els.priority.value = draft.priority;
  if (draft.githubRepo) els.githubRepo.value = draft.githubRepo;
  if (draft.description) els.description.value = draft.description;
  if (draft.agentType) els.agentType.value = draft.agentType;
  if (draft.assignedTo) els.agentAssign.value = draft.assignedTo;
  if (draft.model) els.agentModel.value = draft.model;
  if (!els.taskCreateModal.open) els.taskCreateModal.showModal();
  updateTaskAgentModels();
  requestAnimationFrame(() => els.title.focus());
}

function closeTaskCreateModal() {
  if (els.taskCreateModal.open) els.taskCreateModal.close();
  resetTaskForm();
  els.magicTaskInput.value = "";
}

function buildTaskLogKey(log: TaskTerminalLog) {
  return [log.timestamp, log.type, log.agentId || "", log.taskId ?? "", log.content].join("|");
}

function scrollTaskHistoryToBottom(force = false) {
  const isNearBottom = els.taskHistoryContent.scrollTop + els.taskHistoryContent.clientHeight >= els.taskHistoryContent.scrollHeight - 80;
  if (force || isNearBottom) {
    els.taskHistoryContent.scrollTop = els.taskHistoryContent.scrollHeight;
  }
}

function setTaskHistoryPlaceholder(message: string) {
  activeTaskLogKeys.clear();
  els.taskHistoryContent.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "terminal-placeholder";
  empty.textContent = message;
  els.taskHistoryContent.append(empty);
}

function appendTaskHistoryEntry(log: TaskTerminalLog) {
  const key = buildTaskLogKey(log);
  if (activeTaskLogKeys.has(key)) return;
  activeTaskLogKeys.add(key);

  const placeholder = els.taskHistoryContent.querySelector(".terminal-placeholder");
  if (placeholder) placeholder.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";

  const meta = document.createElement("div");
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = `[${new Date(log.timestamp).toLocaleTimeString()}]`;
  meta.append(time);

  if (log.agentId) {
    const source = document.createElement("span");
    source.className = "log-source";
    source.textContent = agents.find((agent) => agent.id === log.agentId)?.role || log.agentId;
    meta.append(source);
  }

  const text = document.createElement("pre");
  text.className = `log-text log-${log.type}`;
  text.textContent = log.content;

  entry.append(meta, text);
  els.taskHistoryContent.append(entry);
  scrollTaskHistoryToBottom();
}

function renderTaskHistory(logs: TaskTerminalLog[]) {
  activeTaskLogKeys.clear();
  els.taskHistoryContent.innerHTML = "";

  if (logs.length === 0) {
    setTaskHistoryPlaceholder("Nenhum histórico disponível para esta tarefa.");
    return;
  }

  logs.forEach(appendTaskHistoryEntry);
  scrollTaskHistoryToBottom(true);
}

function updateTaskHistoryStatus(task: Task) {
  els.taskHistoryStatus.className = "live-badge";
  if (task.lane === "done") {
    els.taskHistoryStatus.textContent = "Finalizada";
    els.taskHistoryStatus.classList.add("is-done");
    return;
  }
  if (task.assignedTo) {
    els.taskHistoryStatus.textContent = "Ao vivo";
    els.taskHistoryStatus.classList.add("is-live");
    return;
  }
  els.taskHistoryStatus.textContent = "Aguardando";
}

function renderTaskDetails(task: Task) {
  els.taskDetailsTitle.textContent = `Tarefa #${task.id}: ${task.title}`;
  els.taskDetailsDescription.textContent = task.description || "Sem descrição.";
  els.taskDetailsStatus.textContent = laneLabels[task.lane] || task.lane;
  els.taskDetailsStatus.className = `tag lane-${task.lane}`;

  const agentsById = new Map(agents.map((agent) => [agent.id, agent.role]));
  els.taskDetailsAgent.textContent = task.assignedTo ? agentsById.get(task.assignedTo) || task.assignedTo : "Ninguém designado";

  const repoLink = normalizeRepoLink(task.githubRepo);
  if (repoLink) {
    els.taskDetailsRepo.textContent = repoLink;
    els.taskDetailsRepo.href = repoLink;
    els.taskDetailsRepo.style.pointerEvents = "auto";
  } else {
    els.taskDetailsRepo.textContent = "Sem repositório vinculado";
    els.taskDetailsRepo.removeAttribute("href");
    els.taskDetailsRepo.style.pointerEvents = "none";
  }

  els.taskDetailsMeta.innerHTML = `
    <span class="tag">${task.category}</span>
    <span class="tag priority-${task.priority}">${task.priority}</span>
    ${task.agentType ? `<span class="tag">cli/sdk: ${task.agentType}</span>` : ""}
  `;

  if (task.workDir) {
    els.taskOpenFolderBtn.style.display = "block";
    els.taskOpenFolderBtn.onclick = () => {
      fetch(`${API_URL}/api/tasks/${task.id}/open-folder`, { method: "POST" });
      showToast("Abrindo pasta local...", "info");
    };
  } else {
    els.taskOpenFolderBtn.style.display = "none";
  }

  updateTaskHistoryStatus(task);
}

function syncActiveTaskDetails() {
  if (activeTaskDetailsId === null || !els.taskDetailsModal.open) return;
  const task = tasks.find((item) => item.id === activeTaskDetailsId);
  if (task) renderTaskDetails(task);
}

// Confetti State
const confettiParticles: { mesh: THREE.Points; velocities: { x: number; y: number; z: number }[]; age: number }[] = [];

let isOfficeCreated = false;
export let officeData: { padPositions: THREE.Vector3[] } = { padPositions: [] };

function updateState(data: State) {
  if (!data || !Array.isArray(data.tasks) || !Array.isArray(data.agents) || !Array.isArray(data.events)) return;

  pendingStateData = data;
  
  const now = Date.now();
  if (stateUpdateQueued && (now - lastUpdateTimestamp < STATE_DEBOUNCE_MS)) return;
  
  stateUpdateQueued = true;
  lastUpdateTimestamp = now;

  requestAnimationFrame(() => {
    const data = pendingStateData;
    stateUpdateQueued = false;
    if (!data) return;

    // Detect completions for celebration
    const newTasks = data.tasks || [];
    const nextTaskState = new Map<number, { lane: string; assignedTo: string | null }>();
    newTasks.forEach((t: Task) => {
      const old = previousTaskState.get(t.id);
      if (old && old.lane !== "done" && t.lane === "done") {
        spawnConfetti();
        playSuccessSound();
        if (old.assignedTo) {
          // Find the mesh for the agent that finished this
          const item = agentMeshes.get(old.assignedTo);
          if (item) {
            item.phase = "celebrating";
            item.phaseTimer = 3.0; // seconds
          }
        }
      }
      nextTaskState.set(t.id, { lane: t.lane, assignedTo: t.assignedTo ?? null });
    });
    previousTaskState = nextTaskState;

    tasks = newTasks;
    agents = data.agents || [];

    updateDashboard();

    // Create office dynamically once we know how many agents there are
    if (!isOfficeCreated && agents.length > 0) {
      const data = createOffice(scene, agents.length);
      officeData.padPositions = data.padPositions;
      isOfficeCreated = true;
      spawnComputers();
    }

    eventLog = data.events || [];
    syncActiveTaskDetails();
    render();
  });
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

async function updateTaskAgentModels() {
  const agentId = els.agentAssign.value;
  const driver = els.driverSelect.value;

  let tool = driver; // Fallback to global driver
  if (agentId) {
    const agent = agents.find(a => a.id === agentId);
    if (agent && agent.tool) tool = agent.tool;
  }

  if (!tool) {
    els.agentModelDropdown.innerHTML = '<option value="">Selecione um agente ou ferramenta</option>';
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/models?tool=${tool}`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      els.agentModelDropdown.innerHTML = data.models.map((m: string) => `<option value="${m}">${m}</option>`).join("");
    } else {
      els.agentModelDropdown.innerHTML = '<option value="">Nenhum modelo encontrado</option>';
    }
  } catch (e) {
    console.error("Erro ao carregar modelos para a tarefa:", e);
  }
}

async function fetchState() {
  try {
    const res = await fetch(`${API_URL}/api/state`);
    if (!res.ok) return;
    const data = await res.json();
    updateState(data);
  } catch (e) {
    console.error("Failed to fetch state:", e);
  }
}

async function apiCall(endpoint: string, method: string, body: unknown) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // State update handled by SSE
    return await res.json();
  } catch (e) {
    console.error(`API call failed ${endpoint}:`, e);
  }
}

async function createTask(taskParams: { title: string; source: string; category: string; priority: string; githubRepo?: string; description?: string; agentType?: string; assignedTo?: string; model?: string; }) {
  const response = await apiCall("/api/tasks", "POST", taskParams);
  if (response?.error) {
    showToast(`Erro ao criar tarefa: ${response.error}`, "error");
    return;
  }
  playSuccessSound();
  showToast(`Tarefa criada: ${taskParams.title}`, "success");
  closeTaskCreateModal();
}

function pickTask(task: Task) {
  apiCall("/api/assign", "POST", { taskId: task.id, category: task.category });
  playClickSound();
  showToast("Tarefa atribuída", "info");
}

function interruptTask(task: Task) {
  apiCall("/api/interrupt", "POST", { taskId: task.id });
  playErrorSound();
  showToast("Tarefa interrompida", "error");
}

function moveTask(task: Task, dir: number) {
  const idx = lanes.indexOf(task.lane);
  const next = idx + dir;
  if (next < 0 || next >= lanes.length) return;
  apiCall("/api/move", "POST", { taskId: task.id, lane: lanes[next] });
}

function reprioritize(task: Task, direction: number) {
  apiCall("/api/reorder", "POST", { taskId: task.id, direction });
}

function bugFromTask(task: Task) {
  openTaskCreateModal({
    title: `Bug reportado em: ${task.title}`,
    source: "agente",
    category: "bug",
    priority: "alta",
    githubRepo: task.githubRepo,
    description: `Contexto da tarefa original #${task.id}: ${task.title}`,
  });
}

function renderKanban() {
  els.kanban.innerHTML = "";
  const agentsById = new Map(agents.map((agent) => [agent.id, agent.role]));
  const tasksByLane = new Map<string, Task[]>();

  tasks.forEach((task) => {
    if (!tasksByLane.has(task.lane)) tasksByLane.set(task.lane, []);
    tasksByLane.get(task.lane)!.push(task);
  });

  lanes.forEach((lane) => {
    const col = document.createElement("div");
    col.className = "column";
    col.innerHTML = `<h3>${laneLabels[lane]}</h3>`;

    (tasksByLane.get(lane) || []).forEach((task) => {
      const card = document.createElement("article");
      card.className = `task-card priority-${task.priority}`;
      card.style.cursor = "pointer";
      card.onclick = (e) => {
        // Prevent click if clicking an action button
        if ((e.target as HTMLElement).tagName === "BUTTON") return;
        openTaskDetailsModal(task);
        playClickSound();
      };
      
      const assigned = task.assignedTo ? agentsById.get(task.assignedTo) ?? "-" : "-";

      // Logs preview
      const lastLog = task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : "";

      card.innerHTML = `
          <strong>#${task.id} ${task.title}</strong>
          ${task.description ? `<p style="font-size:0.8em; margin: 4px 0">${task.description}</p>` : ""}
          <div class="task-meta">
            ${task.githubRepo ? `<span class="tag">Repo: ${task.githubRepo}</span>` : ""}
            <span class="tag">${task.category}</span>
            <span class="tag">${task.priority}</span>
            <span class="tag">fonte: ${task.source}</span>
            <span class="tag">agente: ${assigned}</span>
            ${task.agentType ? `<span class="tag">cli/sdk: ${task.agentType}</span>` : ""}
            ${task.interrupted ? '<span class="tag">interrompido</span>' : ""}
          </div>
          ${lastLog ? `<div style="font-size:0.8em; margin-top:5px; color:#aaa;">> ${lastLog}</div>` : ""}
        `;

      const actions = document.createElement("div");
      actions.className = "task-actions";

      const makeBtn = (txt: string, onClick: () => void) => {
        const btn = document.createElement("button");
        btn.textContent = txt;
        btn.onclick = onClick;
        return btn;
      };

      if (lane === "backlog") actions.append(makeBtn("Pegar tarefa", () => pickTask(task)));
      if (lane === "in_progress") actions.append(makeBtn("Interromper", () => interruptTask(task)));

      actions.append(makeBtn("←", () => moveTask(task, -1)));
      actions.append(makeBtn("→", () => moveTask(task, +1)));
      actions.append(makeBtn("↑", () => reprioritize(task, -1)));
      actions.append(makeBtn("↓", () => reprioritize(task, +1)));
      actions.append(makeBtn("+ bug", () => bugFromTask(task)));

      card.append(actions);
      col.append(card);
    });

    els.kanban.append(col);
  });
}

function renderAgents() {
  if (agents.length === 0) {
    els.agentsList.innerHTML = '<div class="agent-empty">Nenhum agente configurado.<br>Clique em "Novo Agente" para adicionar.</div>';
  } else {
    els.agentsList.innerHTML = "";
    agents.forEach((a) => {
      const div = document.createElement("div");
      div.className = "agent-item";
      const statusClass = a.status === "idle" ? "status-idle" : "status-working";
      const statusLabel = a.status === "idle" ? "Livre" : "Trabalhando";
      div.innerHTML = `
        <div class="agent-header">
          <strong>${a.role}</strong>
          <span class="agent-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="agent-details">
          <span>Modelo: ${a.model}</span>
          <span>Categoria: ${a.category}</span>
          ${a.tool ? `<span>Ferramenta: ${a.tool}</span>` : ""}
          ${a.assignedTask ? `<span>Task: #${a.assignedTask}</span>` : ""}
        </div>
      `;
      const actions = document.createElement("div");
      actions.className = "agent-actions";
      const termBtn = document.createElement("button");
      termBtn.className = "agent-term-btn";
      termBtn.textContent = "📟 Terminal";
      termBtn.onclick = () => openTerminal(a.id);
      const editBtn = document.createElement("button");
      editBtn.className = "agent-edit-btn";
      editBtn.textContent = "✏️ Editar";
      editBtn.onclick = () => openAgentEditModal(a);
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "agent-delete-btn";
      deleteBtn.textContent = "🗑️ Excluir";
      deleteBtn.onclick = () => deleteAgentById(a.id, a.role);
      actions.append(termBtn, editBtn, deleteBtn);
      div.append(actions);
      els.agentsList.append(div);
    });
  }
  // Dynamically populate taskAgentAssign dropdown
  populateAgentAssignDropdown();
}

// --- Terminal UI Logic ---
declare class Terminal {
  constructor(options?: unknown);
  loadAddon(addon: unknown): void;
  open(parent: HTMLElement): void;
  onData(callback: (data: string) => void): void;
  write(data: string): void;
  focus(): void;
  dispose(): void;
}

declare namespace FitAddon {
  class FitAddon {
    constructor();
    fit(): void;
  }
}

declare namespace WebLinksAddon {
  class WebLinksAddon {
    constructor();
  }
}

class TerminalInstance {
  term: Terminal;
  fitAddon: FitAddon.FitAddon;
  agentId: string;
  container: HTMLDivElement;
  tab: HTMLDivElement;

  constructor(agentId: string, agentRole: string) {
    this.agentId = agentId;

    // Create container
    this.container = document.createElement("div");
    this.container.className = "terminal-instance";
    els.terminalsContent.appendChild(this.container);

    // Create tab
    this.tab = document.createElement("div");
    this.tab.className = "terminal-tab";
    this.tab.textContent = agentRole;
    this.tab.onclick = () => terminalUIManager.setActive(agentId);
    els.terminalsTabs.appendChild(this.tab);

    // Initialize xterm.js
    this.term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Share Tech Mono', monospace",
      theme: {
        background: "#ffffff",
        foreground: "#1e293b",
        cursor: "#0f172a",
        black: "#1e293b",
        red: "#ef4444",
        green: "#15803d",
        yellow: "#eab308",
        blue: "#0284c7",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#f8fafc"
      }
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon.WebLinksAddon());

    this.term.open(this.container);
    this.fitAddon.fit();

    this.term.onData((data: string) => {
      fetch(`${API_URL}/api/terminals/${encodeURIComponent(agentId)}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data })
      });
    });

    // Resize handling
    window.addEventListener("resize", () => this.fitAddon.fit());
  }

  write(data: string) {
    this.term.write(data);
  }

  focus() {
    this.container.classList.add("active");
    this.tab.classList.add("active");
    this.term.focus();
    setTimeout(() => this.fitAddon.fit(), 10);
  }

  hide() {
    this.container.classList.remove("active");
    this.tab.classList.remove("active");
  }

  dispose() {
    this.container.remove();
    this.tab.remove();
    this.term.dispose();
  }
}

class TerminalUIManager {
  instances = new Map<string, TerminalInstance>();
  activeAgentId: string | null = null;
  isMinimized = true;

  constructor() {
    if (els.closeAllTerminalsBtn) {
      els.closeAllTerminalsBtn.onclick = () => this.toggleMinimize();
    }
    // Set initial state
    els.terminalsLayer.classList.add("minimized");
  }

  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    if (this.isMinimized) {
      els.terminalsLayer.classList.add("minimized");
      els.closeAllTerminalsBtn.textContent = "Maximizar";
    } else {
      els.terminalsLayer.classList.remove("minimized");
      els.closeAllTerminalsBtn.textContent = "Minimizar";
      if (this.activeAgentId) {
        const inst = this.instances.get(this.activeAgentId);
        if (inst) setTimeout(() => inst.fitAddon.fit(), 100);
      }
    }
  }

  async openTerminal(agentId: string) {
    let inst = this.instances.get(agentId);
    if (!inst) {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return;

      inst = new TerminalInstance(agentId, agent.role);
      this.instances.set(agentId, inst);

      // Start session on server
      try {
        await fetch(`${API_URL}/api/terminals/${encodeURIComponent(agentId)}/start`, { method: "POST" });
      } catch (e) {
        console.error("Failed to start terminal session", e);
      }
    }

    this.setActive(agentId);
    if (this.isMinimized) this.toggleMinimize();
  }

  setActive(agentId: string) {
    this.instances.forEach(inst => inst.hide());
    const target = this.instances.get(agentId);
    if (target) {
      target.focus();
      this.activeAgentId = agentId;
    }
  }

  handleTerminalData(agentId: string, content: string) {
    const inst = this.instances.get(agentId);
    if (inst) {
      inst.write(content);
    }
  }

  handleTerminalExit(agentId: string, code: number) {
    const inst = this.instances.get(agentId);
    if (inst) {
      inst.write(`\r\n[Processo encerrado com código ${code}]\r\n`);
    }
  }

  cleanupDeadAgents(activeAgents: Agent[]) {
    const activeIds = new Set(activeAgents.map(a => a.id));
    this.instances.forEach((inst, id) => {
      if (!activeIds.has(id)) {
        inst.dispose();
        this.instances.delete(id);
      }
    });
  }
}

const terminalUIManager = new TerminalUIManager();

function openTerminal(agentId: string) {
  terminalUIManager.openTerminal(agentId);
}

async function openTaskDetailsModal(task: Task) {
  activeTaskDetailsId = task.id;
  renderTaskDetails(task);
  setTaskHistoryPlaceholder("Carregando terminal...");
  if (!els.taskDetailsModal.open) els.taskDetailsModal.showModal();

  try {
    const res = await fetch(`${API_URL}/api/tasks/${task.id}/terminal`);
    const data = await res.json();
    if (activeTaskDetailsId !== task.id) return;
    renderTaskHistory((data.logs || []) as TaskTerminalLog[]);
  } catch (e) {
    if (activeTaskDetailsId !== task.id) return;
    setTaskHistoryPlaceholder("Erro ao carregar histórico.");
    console.error(e);
  }
}

function populateAgentAssignDropdown() {
  if (!els.agentAssign) return;
  const currentVal = els.agentAssign.value;
  els.agentAssign.innerHTML = '<option value="">- Automático Direcionado -</option>';
  agents.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a.id;
    opt.textContent = `${a.role} (${a.category})`;
    els.agentAssign.append(opt);
  });
  els.agentAssign.value = currentVal;
}

async function openAgentEditModal(agent: Agent) {
  els.agentEditId.value = agent.id;
  els.agentRole.value = agent.role;
  els.agentCategory.value = agent.category;
  els.agentModalTitle.textContent = "Editar Agente";
  els.agentSubmitBtn.textContent = "Salvar Alterações";
  // Load tools
  els.agentTool.innerHTML = '<option value="">Carregando...</option>';
  try {
    const res = await fetch(`${API_URL}/api/tools`);
    const data = await res.json() as { tools: { id: string; name: string }[] };
    if (data.tools && data.tools.length > 0) {
      els.agentTool.innerHTML = '<option value="">Selecione a ferramenta</option>' + data.tools.map((t) => `<option value="${t.id}"${t.id === agent.tool ? ' selected' : ''}>${t.name}</option>`).join("");
    }
  } catch (e) { console.error(e); }
  // Load models for the tool
  if (agent.tool) {
    try {
      const res = await fetch(`${API_URL}/api/models?tool=${agent.tool}`);
      const data = await res.json();
      if (data.models && data.models.length > 0) {
        els.agentModelDropdown.innerHTML = data.models.map((m: string) => `<option value="${m}"${m === agent.model ? ' selected' : ''}>${m}</option>`).join("");
      }
    } catch (e) { console.error(e); }
  } else {
    els.agentModelDropdown.innerHTML = `<option value="${agent.model}" selected>${agent.model}</option>`;
  }
  updateAgentColorBadge();
  els.agentModal.showModal();
}

async function deleteAgentById(agentId: string, agentRole: string) {
  if (!confirm(`Tem certeza que deseja excluir o agente "${agentRole}"?`)) return;
  await apiCall(`/api/agents/${encodeURIComponent(agentId)}`, "DELETE", {});
  playErrorSound();
  showToast(`Agente "${agentRole}" removido`, "error");
}

function addEvent(text: string) {
  // Local event log update (optional, but good for immediate feedback if SSE is slow)
  // But strictly we should rely on state from server to be single source of truth
  // So I'll comment this out and let SSE handle it
  // eventLog.unshift({ timestamp: new Date().toLocaleTimeString(), text });
  // renderEvents();
}
function renderEvents() {
  const maxEvents = 200;
  els.eventLog.innerHTML = eventLog
    .slice(0, maxEvents)
    .map((e) => `<li>${e.timestamp} — ${e.text}</li>`)
    .join("");
}

function render() {
  renderKanban();
  renderAgents();
  renderEvents();
  updateKanban3D();
  updateAgents3D();
}

els.driverSelect?.addEventListener("change", async () => {
  const driver = els.driverSelect.value;
  await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driver }) });
  updateTaskAgentModels();
});

els.agentAssign?.addEventListener("change", () => {
  updateTaskAgentModels();
});
els.createTaskBtn.addEventListener("click", () => openTaskCreateModal());

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await createTask({
    title: els.title.value.trim(),
    source: els.source.value,
    category: els.category.value,
    priority: els.priority.value,
    githubRepo: els.githubRepo?.value.trim(),
    description: els.description?.value.trim(),
    agentType: els.agentType?.value.trim(),
    assignedTo: els.agentAssign?.value || undefined,
    model: els.agentModel?.value
  });
});

els.toggleViewBtn.addEventListener("click", () => {
  els.view3d.classList.toggle("active");
  els.view2d.classList.toggle("active");
});

els.fullscreenBtn.addEventListener("click", () => {
  els.view2d.classList.toggle("fullscreen");
  if (els.view2d.classList.contains("fullscreen")) {
    els.fullscreenBtn.textContent = "Sair da Tela Cheia";
    els.view2d.classList.add("active");
    els.view3d.classList.remove("active");
  } else {
    els.fullscreenBtn.textContent = "Tela Cheia Kanban";
    els.view3d.classList.add("active");
    els.view2d.classList.remove("active");
  }
});

// --- Magic Add Logic ---
els.magicTaskBtn.addEventListener("click", () => {
  const input = els.magicTaskInput.value.trim();
  if (!input) return;
  const draft = inferTaskDraft(input);
  els.title.value = draft.title;
  els.category.value = draft.category;
  els.priority.value = draft.priority;
  if (els.description) els.description.value = draft.description;
  els.magicTaskInput.value = "";
  showToast("Formulário preenchido com sucesso!", "success");
  playClickSound();
});

els.resetDataBtn.addEventListener("click", () => {
  if (confirm("Tem certeza que deseja apagar todos os dados do servidor?")) {
    apiCall("/api/reset", "POST", {});
  }
});

els.clearDoneBtn?.addEventListener("click", () => {
  if (confirm("Tem certeza que deseja limpar todas as tarefas concluídas?")) {
    apiCall("/api/tasks/clear-done", "POST", {});
  }
});

// --- Command Palette Logic ---
let selectedSuggestionIndex = -1;

function closeCommandPalette() {
  els.commandPalette.close();
  els.commandInput.value = "";
  els.commandSuggestions.innerHTML = "";
  selectedSuggestionIndex = -1;
}

function openCommandPalette() {
  els.commandPalette.showModal();
  els.commandInput.focus();
}

function renderCommandSuggestions(input: string) {
  els.commandSuggestions.innerHTML = "";
  selectedSuggestionIndex = -1;

  if (!input.trim()) return;

  const suggestions: { label: string; action: () => void }[] = [];

  if (input.startsWith("/task ")) {
    const title = input.replace("/task ", "").trim();
    if (title) {
      suggestions.push({
        label: `📝 Criar Tarefa: "${title}"`,
        action: () => {
          closeCommandPalette();
          openTaskCreateModal({ ...inferTaskDraft(title), source: "usuario" });
        }
      });
    }
  } else if (input.startsWith("/agent ")) {
    const role = input.replace("/agent ", "").trim();
    if (role) {
      suggestions.push({
        label: `🤖 Criar Agente: "${role}"`,
        action: async () => {
          closeCommandPalette();
          // Open agent modal prefilled
          els.createAgentBtn.click();
          // Wait for modal to open and load tools
          setTimeout(() => {
            els.agentRole.value = role;
            const lowerRole = role.toLowerCase();
            let category = "misc";
            if (lowerRole.includes("segurança")) category = "security";
            if (lowerRole.includes("pm") || lowerRole.includes("product")) category = "roadmap";
            if (lowerRole.includes("teste") || lowerRole.includes("qa")) category = "test";
            if (lowerRole.includes("feature") || lowerRole.includes("dev")) category = "feature";
            els.agentCategory.value = category;
          }, 300);
        }
      });
    }
  } else {
    // Default suggestions based on what they are typing
    const lowerInput = input.toLowerCase();
    if ("tarefa".includes(lowerInput) || "nova".includes(lowerInput) || "criar".includes(lowerInput)) {
      suggestions.push({
        label: `💡 Dica: Digite "/task [título]" para criar uma tarefa`,
        action: () => {
          els.commandInput.value = "/task ";
          els.commandInput.focus();
        }
      });
    }
    if ("agente".includes(lowerInput) || "novo".includes(lowerInput) || "criar".includes(lowerInput)) {
      suggestions.push({
        label: `💡 Dica: Digite "/agent [papel]" para criar um agente`,
        action: () => {
          els.commandInput.value = "/agent ";
          els.commandInput.focus();
        }
      });
    }
  }

  suggestions.forEach((s, idx) => {
    const li = document.createElement("li");
    li.textContent = s.label;
    li.onclick = s.action;
    li.onmouseenter = () => {
      Array.from(els.commandSuggestions.children).forEach(c => c.classList.remove("selected"));
      li.classList.add("selected");
      selectedSuggestionIndex = idx;
    };
    els.commandSuggestions.appendChild(li);
  });
}

els.commandInput.addEventListener("input", (e) => {
  renderCommandSuggestions((e.target as HTMLInputElement).value);
});

els.commandInput.addEventListener("keydown", (e) => {
  const items = Array.from(els.commandSuggestions.children) as HTMLElement[];
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (items.length > 0) {
      selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
      items.forEach((item, idx) => {
        item.classList.toggle("selected", idx === selectedSuggestionIndex);
      });
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (items.length > 0) {
      selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
      items.forEach((item, idx) => {
        item.classList.toggle("selected", idx === selectedSuggestionIndex);
      });
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < items.length) {
      items[selectedSuggestionIndex].click();
    }
  }
});

// --- Modals Logic ---
function updateAgentColorBadge() {
  const role = els.agentRole.value.trim();
  const roleColors: Record<string, string> = {
    "Product Manager": "#111111",
    "Segurança": "#1e3a8a",
    "Performance": "#475569",
    "Novas Funcionalidades": "#0284c7",
    "Testes": "#15803d",
    "Novas Features": "#0f172a"
  };

  els.agentColorBadge.style.background = roleColors[role] || "#888888";
}

els.agentRole.addEventListener("input", updateAgentColorBadge);

els.createAgentBtn.addEventListener("click", async () => {
  // Reset modal to create mode
  els.agentEditId.value = "";
  els.agentForm.reset();
  els.agentModalTitle.textContent = "Criar Novo Agente";
  els.agentSubmitBtn.textContent = "Criar Agente";
  els.agentModelDropdown.innerHTML = '<option value="">Selecione a ferramenta primeiro</option>';
  els.agentModal.showModal();
  els.agentTool.innerHTML = '<option value="">Carregando...</option>';
  try {
    const res = await fetch(`${API_URL}/api/tools`);
    const data = await res.json() as { tools: { id: string; name: string }[] };
    if (data.tools && data.tools.length > 0) {
      els.agentTool.innerHTML = '<option value="">Selecione a ferramenta</option>' + data.tools.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
    } else {
      els.agentTool.innerHTML = '<option value="">Nenhuma ferramenta CLI encontrada</option>';
    }
  } catch (e) {
    console.error(e);
  }
});

els.cancelAgentBtn.addEventListener("click", () => els.agentModal.close());

els.agentTool.addEventListener("change", async (e: Event) => {
  const tool = (e.target as HTMLSelectElement).value;
  if (!tool) {
    els.agentModelDropdown.innerHTML = '<option value="">Selecione a ferramenta primeiro</option>';
    return;
  }
  els.agentModelDropdown.innerHTML = '<option value="">Carregando modelos...</option>';
  try {
    const res = await fetch(`${API_URL}/api/models?tool=${tool}`);
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      els.agentModelDropdown.innerHTML = data.models.map((m: string) => `<option value="${m}">${m}</option>`).join("");
    } else {
      els.agentModelDropdown.innerHTML = '<option value="">Nenhum modelo encontrado</option>';
    }
  } catch (e) { console.error(e); }
});

els.agentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const editId = els.agentEditId.value;
  const role = els.agentRole.value;
  const category = els.agentCategory.value;
  const tool = els.agentTool.value;
  const model = els.agentModelDropdown.value;

  if (editId) {
    // Edit mode
    await apiCall(`/api/agents/${encodeURIComponent(editId)}`, "PUT", { role, category, tool, model });
    showToast(`Agente "${role}" atualizado`, "success");
  } else {
    // Create mode
    await apiCall("/api/agents", "POST", { role, category, tool, model });
    showToast(`Agente "${role}" criado`, "success");
  }
  els.agentModal.close();
  els.agentForm.reset();
  els.agentEditId.value = "";
  els.agentModelDropdown.innerHTML = '<option value="">Selecione a ferramenta primeiro</option>';
});

els.settingsBtn.addEventListener("click", async () => {
  els.settingsModal.showModal();
  try {
    const res = await fetch(`${API_URL}/api/config/clone-dir`);
    const data = await res.json();
    els.configCloneDir.value = data.cloneDir || "";
  } catch (e) { console.error(e); }
});

els.closeTaskCreateBtn.addEventListener("click", () => closeTaskCreateModal());
els.cancelTaskBtn.addEventListener("click", () => closeTaskCreateModal());
els.cancelSettingsBtn.addEventListener("click", () => els.settingsModal.close());
els.closeTaskDetailsBtn.addEventListener("click", () => els.taskDetailsModal.close());
els.taskDetailsModal.addEventListener("close", () => {
  activeTaskDetailsId = null;
  activeTaskLogKeys.clear();
});
els.taskCreateModal.addEventListener("close", () => {
  resetTaskForm();
  els.magicTaskInput.value = "";
});

els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  // Save clone dir
  await apiCall("/api/config/clone-dir", "POST", { cloneDir: els.configCloneDir.value });

  // Save env vars
  const envUpdates: Record<string, string> = {};
  if (els.envOpenAI.value) envUpdates["OPENAI_API_KEY"] = els.envOpenAI.value;
  if (els.envGemini.value) envUpdates["GEMINI_API_KEY"] = els.envGemini.value;
  if (els.envAnthropic.value) envUpdates["ANTHROPIC_API_KEY"] = els.envAnthropic.value;
  if (els.envGithubUser.value) envUpdates["GITHUB_USER"] = els.envGithubUser.value;
  if (els.envGithub.value) envUpdates["GITHUB_TOKEN"] = els.envGithub.value;

  if (Object.keys(envUpdates).length > 0) {
    await apiCall("/api/settings/env", "POST", envUpdates);
    showToast("Configurações e API Keys salvas!", "success");
    // Clear password fields for security
    els.envOpenAI.value = "";
    els.envGemini.value = "";
    els.envAnthropic.value = "";
    els.envGithubUser.value = "";
    els.envGithub.value = "";
  } else {
    showToast("Configurações salvas!", "success");
  }

  els.settingsModal.close();
});

// --- 3D Scene ---
const canvas = document.getElementById("sceneCanvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#e2e8f0"); // Lighter grey base
const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight("#ffffff", 1.5);
scene.add(ambientLight);
const dir = new THREE.DirectionalLight("#ffffff", 1.0);
dir.position.set(5, 8, 3);
scene.add(dir);

function updateLighting() {
  const workingCount = agents.filter(a => a.status === "working").length;
  // Target intensity: brighter when busy
  const targetDir = workingCount > 0 ? 1.4 : 1.0;
  const targetAmb = workingCount > 0 ? 1.8 : 1.5;

  dir.intensity += (targetDir - dir.intensity) * 0.05;
  ambientLight.intensity += (targetAmb - ambientLight.intensity) * 0.05;
}

// Office data is now populated dynamically when state loads

// No Particles

let computers: THREE.Group[] = [];

// Desk generation
function spawnComputers() {
  const loader = new GLTFLoader();
  loader.load("/models/old_computer.glb", (gltf) => {
    officeData.padPositions.forEach((pos) => {
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z - 1.2);

      const computer = gltf.scene.clone();
      computer.scale.set(0.6, 0.6, 0.6);
      computer.rotation.y = Math.PI;
      group.add(computer);

      // Oval rug
      const rugGeo = new THREE.CylinderGeometry(2, 2, 0.01, 32);
      const rugMat = new THREE.MeshStandardMaterial({ color: "#64748b" });
      const rug = new THREE.Mesh(rugGeo, rugMat);
      rug.scale.set(1, 1, 0.6);
      rug.position.set(0, 0.01, 0);
      group.add(rug);

      scene.add(group);
      computers.push(group);
    });
  }, undefined, (error) => {
    console.error("Falha ao carregar modelo old_computer.glb, usando fallback", error);
    officeData.padPositions.forEach((pos) => {
      const deskGroup = new THREE.Group();
      deskGroup.position.set(pos.x, 0, pos.z - 1.2);

      const deskGeo = new THREE.BoxGeometry(2.0, 1.0, 1.2);
      const deskMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.8, metalness: 0.1 }); // Darker desk
      const desk = new THREE.Mesh(deskGeo, deskMat);
      desk.position.set(0, 0.5, 0);
      deskGroup.add(desk);

      const monGeo = new THREE.BoxGeometry(0.9, 0.6, 0.05);
      const monMat = new THREE.MeshStandardMaterial({ color: "#0ea5e9", emissive: "#0ea5e9", emissiveIntensity: 0.3 }); // Cyan blue monitor
      const monitor = new THREE.Mesh(monGeo, monMat);
      monitor.position.set(0, 1.3, 0);
      deskGroup.add(monitor);

      scene.add(deskGroup);
      computers.push(deskGroup);
    });
  });
}

// Confetti System
function spawnConfetti() {
  const geometry = new THREE.BufferGeometry();
  const count = 150;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities: { x: number, y: number, z: number }[] = [];

  for (let i = 0; i < count; i++) {
    positions[i * 3] = 0; // x (center)
    positions[i * 3 + 1] = 5; // y (high up)
    positions[i * 3 + 2] = -4; // z (near board)

    const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;

    velocities.push({
      x: (Math.random() - 0.5) * 0.3,
      y: (Math.random() * 0.3) + 0.1,
      z: (Math.random() - 0.5) * 0.3
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  confettiParticles.push({ mesh: points, velocities, age: 0 });
}

function updateConfetti() {
  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i];
    p.age++;
    const positions = p.mesh.geometry.attributes.position.array;

    for (let j = 0; j < p.velocities.length; j++) {
      p.velocities[j].y -= 0.005; // Gravity
      positions[j * 3] += p.velocities[j].x;
      positions[j * 3 + 1] += p.velocities[j].y;
      positions[j * 3 + 2] += p.velocities[j].z;
    }
    p.mesh.geometry.attributes.position.needsUpdate = true;

    if (p.age > 200) {
      scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      confettiParticles.splice(i, 1);
    }
  }
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
controls.mouseButtons.RIGHT = null;

const kanbanMesh = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.2), new THREE.MeshStandardMaterial({ color: "#ffffff" }));
kanbanMesh.position.set(0, 3, -4.2);
// Add column separators
for (let i = -1; i <= 1; i++) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.075, 5.7, 0.05), new THREE.MeshStandardMaterial({ color: "#e2e8f0" }));
  line.position.set(i * 3, 0, 0.11);
  kanbanMesh.add(line);
}
scene.add(kanbanMesh);

const kanbanGroup = new THREE.Group();
// Pull it slightly forward off the board mesh to prevent z-fighting
kanbanGroup.position.set(0, 0, 0.05);
kanbanMesh.add(kanbanGroup);

function createTaskTexture(task: Task) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  // Background
  const categoryColors: Record<string, string> = {
    roadmap: "#a855f7",
    security: "#ef4444",
    performance: "#f97316",
    feature: "#3b82f6",
    test: "#22c55e",
    bug: "#06b6d4"
  };

  ctx.fillStyle = categoryColors[task.category] || "#64748b";
  ctx.fillRect(0, 0, 16, canvas.height); // Color strip on left

  ctx.fillStyle = "#334155";
  ctx.fillRect(16, 0, canvas.width - 16, canvas.height);

  // Text
  ctx.font = "bold 28px Inter, sans-serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.fillText(`#${task.id}`, 32, 40);

  ctx.font = "24px Inter, sans-serif";
  ctx.fillStyle = "#cbd5e1";

  // Truncate title
  let title = task.title;
  if (title.length > 30) title = title.substring(0, 30) + "...";
  ctx.fillText(title, 32, 80);

  // Status/Meta
  ctx.font = "18px Inter, sans-serif";
  ctx.fillStyle = "#94a3b8";
  let metaStr = `${task.priority.toUpperCase()} • ${task.category}`;
  if (task.githubRepo) metaStr += ` • ${task.githubRepo}`;
  ctx.fillText(metaStr, 32, 110);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const taskMeshes = new Map<number, THREE.Mesh>();

function updateKanban3D() {
  const visibleTaskIds = new Set<number>();
  const laneCounts: Record<string, number> = { backlog: 0, in_progress: 0, review: 0, done: 0 };

  tasks.forEach(task => {
    const lane = getLaneSafe(task.lane);
    const count = laneCounts[lane] || 0;
    const { x, y } = getTaskCardPosition(lane, count);

    if (shouldRenderTaskIn3D(lane, count, y)) {
      visibleTaskIds.add(task.id);

      let mesh = taskMeshes.get(task.id);
      const signature = `${task.title}-${task.category}-${task.priority}-${task.assignedTo || ''}`;

      if (!mesh) {
        // Create
        const geometry = new THREE.BoxGeometry(2.7, 0.75, 0.05);
        const texture = createTaskTexture(task);
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          emissive: 0x222222,
          emissiveMap: texture,
          emissiveIntensity: 0.4
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.userData = { taskId: task.id, signature };
        kanbanGroup.add(mesh);
        taskMeshes.set(task.id, mesh);
      } else {
        // Update texture if changed
        if (mesh.userData.signature !== signature) {
          const oldTex = (mesh.material as THREE.MeshStandardMaterial).map;
          if (oldTex) oldTex.dispose();
          const newTex = createTaskTexture(task);
          (mesh.material as THREE.MeshStandardMaterial).map = newTex;
          (mesh.material as THREE.MeshStandardMaterial).emissiveMap = newTex;
          mesh.userData.signature = signature;
          (mesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
        }
      }

      mesh.position.set(x, y, 0.15);
    }

    laneCounts[lane] = count + 1;
  });

  // Cleanup invisible/removed tasks
  for (const [id, mesh] of taskMeshes.entries()) {
    if (!visibleTaskIds.has(id)) {
      kanbanGroup.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
      if ((mesh.material as THREE.MeshStandardMaterial).map) (mesh.material as THREE.MeshStandardMaterial).map!.dispose();
      if ((mesh.material as THREE.MeshStandardMaterial).dispose) (mesh.material as THREE.MeshStandardMaterial).dispose();
      taskMeshes.delete(id);
    }
  }
}

const agentMeshes = new Map<string, {
  group: THREE.Group;
  label?: THREE.Sprite;
  target: THREE.Vector3;
  phase: "idle" | "walking_to_board" | "at_board" | "walking_to_desk" | "working" | "walking_from_desk" | "celebrating";
  phaseTimer: number;
  color: THREE.Color;
  mixer?: THREE.AnimationMixer;
  anims?: Record<string, THREE.AnimationAction>;
  currentAction?: THREE.AnimationAction | null;
  laser?: THREE.Line;
  statusSprite?: THREE.Sprite;
}>();

function clearAgentMeshes() {
  agentMeshes.forEach((item) => {
    if (item.laser) {
      scene.remove(item.laser);
      item.laser.geometry.dispose();
      (item.laser.material as THREE.Material).dispose();
    }
    scene.remove(item.group);
  });
  agentMeshes.clear();
}

function rebuildAgentMeshes() {
  clearAgentMeshes();
  agents.forEach((agent, idx) => {
    const meshData = createAgentMesh(agent, idx);
    agentMeshes.set(agent.id, {
      ...meshData,
      phase: "idle",
      phaseTimer: 0
    });
    playAction(agentMeshes.get(agent.id), "Idle", 0);
  });
}

const visualAlerts = new Map<number, THREE.Sprite>();

function createStatusTexture(type: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  if (type === "idle") {
    // Pixel art style Z z
    ctx.fillStyle = "#60a5fa"; // Light blue
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 30px 'Share Tech Mono', monospace";
    ctx.fillText("z", 32, 80);
    ctx.font = "bold 45px 'Share Tech Mono', monospace";
    ctx.fillText("z", 64, 48);
    ctx.font = "bold 60px 'Share Tech Mono', monospace";
    ctx.fillText("Z", 96, 24);
  } else {
    // Fallback emojis
    const emojiMap: Record<string, string> = {
      working: "🔨",
      celebrating: "🎉",
      walking: "🚶"
    };
    ctx.font = "64px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emojiMap[type] || "", 64, 68);
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const statusTextures = {
  idle: createStatusTexture("idle"),
  working: createStatusTexture("working"),
  celebrating: createStatusTexture("celebrating"),
  walking: createStatusTexture("walking")
};

function createAlertIcon(type: "bug" | "perf") {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = type === "bug" ? "#ffb3b3" : "#fbbf24";
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 60px Inter, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(type === "bug" ? "!" : "⚡", 64, 64);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.8, 0.8, 1);
  return sprite;
}

function updateVisualAlerts() {
  tasks.forEach(task => {
    const isBug = (task.category === "bug" || task.category === "test") && task.lane !== "done";
    const isPerf = task.category === "performance" && task.lane !== "done";

    if ((isBug || isPerf) && !visualAlerts.has(task.id)) {
      const icon = createAlertIcon(isBug ? "bug" : "perf");
      scene.add(icon);
      visualAlerts.set(task.id, icon);
    }
  });

  // Remove fixed alerts
  for (const [taskId, sprite] of visualAlerts.entries()) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || task.lane === "done") {
      scene.remove(sprite);
      if (sprite.material.map) sprite.material.map.dispose();
      sprite.material.dispose();
      visualAlerts.delete(taskId);
    } else {
      // Position alert above the card on the board
      const cardMesh = kanbanGroup.children.find(c => c.userData.taskId === taskId);
      if (cardMesh) {
        const worldPos = new THREE.Vector3();
        cardMesh.updateMatrixWorld(true);
        cardMesh.getWorldPosition(worldPos);
        // Floating effect with absolute assignment to prevent coordinate drift
        sprite.position.set(
          worldPos.x,
          worldPos.y + 0.6 + Math.sin(Date.now() * 0.005) * 0.1,
          worldPos.z + 0.2
        );
      }
    }
  }
}

function playAction(item: { anims?: Record<string, THREE.AnimationAction>; currentAction?: THREE.AnimationAction | null } | null | undefined, name: string, duration = 0.5) {
  if (!item || !item.anims) return;
  const action = item.anims[name] || item.anims["Idle"];
  if (action && item.currentAction !== action) {
    if (item.currentAction) {
      item.currentAction.fadeOut(duration);
    }
    action.reset().fadeIn(duration).play();
    item.currentAction = action;
  }
}

function createAgentMesh(agent: Agent, index: number) {
  const group = new THREE.Group();
  group.userData.agentId = agent.id;
  group.userData.model = agent.model;
  group.userData.role = agent.role;

  const roleColors: Record<string, string> = {
    "Product Manager": "#111111", // Black turtleneck
    "Segurança": "#1e3a8a",       // Navy Blue
    "Performance": "#475569",     // Slate
    "Novas Funcionalidades": "#0284c7", // Blue
    "Testes": "#15803d",          // Dark Green
    "Novas Features": "#0f172a"   // Navy
  };
  const color = new THREE.Color(roleColors[agent.role] || "#888888");

  let mixer: THREE.AnimationMixer | undefined;
  let anims: Record<string, THREE.AnimationAction> | undefined;

  // Determine badge color based on tool/model
  let badgeColor = "#555555";
  const tool = agent.tool || "unknown";

  if (tool.includes("openai")) badgeColor = "#10a37f";
  else if (tool.includes("gemini")) badgeColor = "#4285f4";
  else if (tool.includes("copilot")) badgeColor = "#6f42c1";
  else if (tool.includes("opencode")) badgeColor = "#f97316";
  else if (tool.includes("claude")) badgeColor = "#d97757";

  // Boxy Avatar (Minecraft Style)

    // Body (wider and thicker to fit the chest label better)
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.7, 0.3);
    const bodyMats = getBodyMaterials(agent.role, agent.model, badgeColor);

    const body = new THREE.Mesh(bodyGeo, bodyMats);
    body.position.y = 0.85; // Raised slightly due to height increase
    group.add(body);

    // Head (Proportionally larger)
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMats = getHeadMaterials(agent.role);
    const head = new THREE.Mesh(headGeo, headMats);
    head.position.y = 1.45; // 0.85 (body y) + 0.35 (half body height) + 0.25 (half head)
    group.add(head);

    // Limbs
    const limbMat = getLimbMaterial(agent.role);
    const armGeo = new THREE.BoxGeometry(0.25, 0.6, 0.25);
    const legGeo = new THREE.BoxGeometry(0.28, 0.6, 0.28);

    // Left Arm Pivot
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.425, 1.15, 0); // Shoulder position
    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(0, -0.3, 0); // Drop down from pivot
    leftArmPivot.add(leftArm);
    group.add(leftArmPivot);
    group.userData.leftArm = leftArmPivot;

    // Right Arm Pivot
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.425, 1.15, 0); // Shoulder position
    const rightArm = new THREE.Mesh(armGeo, limbMat);
    rightArm.position.set(0, -0.3, 0);
    rightArmPivot.add(rightArm);
    group.add(rightArmPivot);
    group.userData.rightArm = rightArmPivot;

    // Left Leg Pivot
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.16, 0.5, 0); // Hip position
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(0, -0.3, 0);
    leftLegPivot.add(leftLeg);
    group.add(leftLegPivot);
    group.userData.leftLeg = leftLegPivot;

    // Right Leg Pivot
    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.16, 0.5, 0); // Hip position
    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLeg.position.set(0, -0.3, 0);
    rightLegPivot.add(rightLeg);
    group.add(rightLegPivot);
    group.userData.rightLeg = rightLegPivot;

  group.position.set(-5 + index * 2, 0, -0.5);
  scene.add(group);

  let label: THREE.Sprite | undefined = undefined; // We removed the floating label, setting to undefined for TS interface

  const statusMat = new THREE.SpriteMaterial({ map: createStatusTexture("idle"), transparent: true, depthTest: false });
  const statusSprite = new THREE.Sprite(statusMat);
  statusSprite.scale.set(0.6, 0.6, 1);
  statusSprite.position.set(0, 2.2, 0); // Above head
  group.add(statusSprite);

  const laserMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 });
  const laserGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]);
  const laser = new THREE.Line(laserGeo, laserMat);
  laser.visible = false;
  scene.add(laser);

  return { group, label, target: group.position.clone(), color, mixer, anims, currentAction: null, laser, statusSprite };
}

function updateAgents3D() {
  for (const [agentId, item] of agentMeshes.entries()) {
    if (!agents.find((a) => a.id === agentId)) {
      if (item.laser) {
        scene.remove(item.laser);
        item.laser.geometry.dispose();
        (item.laser.material as THREE.Material).dispose();
      }
      scene.remove(item.group);
      agentMeshes.delete(agentId);
    }
  }

  // Check if we need to create meshes for new agents or update existing ones
  agents.forEach((agent, idx) => {
    const existing = agentMeshes.get(agent.id);
    let oldState: { position: THREE.Vector3, rotation: THREE.Euler, target: THREE.Vector3, phase: "idle" | "walking_to_board" | "at_board" | "walking_to_desk" | "working" | "walking_from_desk" | "celebrating", phaseTimer: number } | null = null;

    if (existing) {
      if (existing.group.userData.model !== agent.model || existing.group.userData.role !== agent.role) {
        oldState = {
          position: existing.group.position.clone(),
          rotation: existing.group.rotation.clone(),
          phase: existing.phase,
          phaseTimer: existing.phaseTimer,
          target: existing.target.clone()
        };

        if (existing.laser) {
          scene.remove(existing.laser);
          existing.laser.geometry.dispose();
          (existing.laser.material as THREE.Material).dispose();
        }
        scene.remove(existing.group);
        existing.group.traverse((child: THREE.Object3D) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach((m: THREE.Material) => {
                  const materialWithMap = m as THREE.MeshBasicMaterial;
                  if (materialWithMap.map) materialWithMap.map.dispose();
                  m.dispose();
                });
              } else {
                const singleMaterial = mesh.material as THREE.MeshBasicMaterial;
                if (singleMaterial.map) singleMaterial.map.dispose();
                singleMaterial.dispose();
              }
            }
          }
        });
        agentMeshes.delete(agent.id);
      }
    }

    if (!agentMeshes.has(agent.id)) {
      const meshData = createAgentMesh(agent, idx);
      if (oldState) {
        meshData.group.position.copy(oldState.position);
        meshData.group.rotation.copy(oldState.rotation);
        meshData.target.copy(oldState.target);
        agentMeshes.set(agent.id, {
          ...meshData,
          phase: oldState.phase,
          phaseTimer: oldState.phaseTimer
        });
        // Let the tick logic handle resuming the right animation based on phase
      } else {
        agentMeshes.set(agent.id, {
          ...meshData,
          phase: "idle",
          phaseTimer: 0
        });
        playAction(agentMeshes.get(agent.id), "Idle", 0);
      }
    }
  });

  agents.forEach((agent, idx) => {
    const item = agentMeshes.get(agent.id);
    if (!item) return;

    // Spread agents out more: -8 to +8 roughly
    const spawnPos = new THREE.Vector3(-8 + idx * 3, 0, -1.0);
    const pads = officeData.padPositions;
    const deskIdx = computers.length > 0 ? idx % computers.length : idx % (pads.length || 1);

    // Safe check for computers array
    const deskPos = pads[deskIdx] ? pads[deskIdx].clone() : spawnPos.clone();
    deskPos.y = 0; // Ground level

    // Working Animation is now Sitting
    const workingAnim = item.anims && item.anims["Sitting"] ? "Sitting" : "Idle";

    if (item.phase === "celebrating") {
      // Logic for celebrating happens inside tick() loop, just skip overriding it here.
    } else if (agent.status === "working") {
      if (item.phase === "idle" || item.phase === "walking_from_desk") {
        item.phase = "walking_to_board";
        const boardTarget = new THREE.Vector3(-4 + idx * 1.5, 0, -3.0);
        item.target.copy(boardTarget);
      } else if (item.phase === "walking_to_board") {
        const boardTarget = new THREE.Vector3(-4 + idx * 1.5, 0, -3.0);
        item.target.copy(boardTarget);
        if (item.group.position.distanceTo(item.target) < 0.5) {
          item.phase = "walking_to_desk";
          item.target.copy(deskPos);
        } else {
          playAction(item, "Walking");
        }
      } else if (item.phase === "walking_to_desk") {
        item.target.copy(deskPos);
        if (item.group.position.distanceTo(item.target) < 0.5) {
          item.phase = "working";
          item.group.position.copy(item.target);
          playAction(item, workingAnim);
        } else {
          playAction(item, "Walking");
        }
      } else if (item.phase === "working") {
        item.target.copy(deskPos);
        playAction(item, workingAnim, 1.0);
      }
    } else {
      // If was working, walk back to kanban. Spread them evenly to prevent stacking.
      const kanbanPos = new THREE.Vector3(-6 + idx * 2.5, 0, -2.5);

      if (item.phase === "working" || item.phase === "walking_to_desk") {
        item.phase = "walking_from_desk";
        item.target.copy(kanbanPos);
      } else if (item.phase === "walking_from_desk") {
        item.target.copy(kanbanPos);
        if (item.group.position.distanceTo(item.target) < 0.5) {
          item.phase = "idle";
          item.group.position.copy(item.target);
          playAction(item, "Idle");
        } else {
          playAction(item, "Walking");
        }
      } else {
        item.phase = "idle";
        item.target.copy(kanbanPos);
        playAction(item, "Idle");
      }
    }

    // Rotate to face target
    if (item.phase !== "working" && item.phase !== "idle") {
      item.group.lookAt(item.target.x, item.group.position.y, item.target.z);
    } else if (item.phase === "working") {
      item.group.lookAt(item.group.position.x, item.group.position.y, item.group.position.z - 100);
    } else if (item.phase === "idle") {
      item.group.rotation.set(0, 0, 0); // Face forward towards camera (Kanban board is at z=-4.2, camera is at z=12, so 0 faces the camera)
    } else {
      item.group.rotation.set(0, 0, 0);
    }
  });
}

function tick() {
  const delta = clock.getDelta();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  agentMeshes.forEach((item) => {
    item.group.position.lerp(item.target, 0.08);
    if (item.mixer) item.mixer.update(delta);

    const statusMaterial = item.statusSprite?.material as THREE.SpriteMaterial | undefined;

    if (item.phase === "celebrating") {
      item.phaseTimer -= delta;
      playAction(item, "ThumbsUp");
      if (statusMaterial) statusMaterial.map = statusTextures.celebrating;
      if (item.phaseTimer <= 0) {
        item.phase = "idle";
        playAction(item, "Idle");
      }
    } else if (item.phase === "working") {
      if (statusMaterial) statusMaterial.map = statusTextures.working;
    } else if (item.phase === "idle") {
      if (statusMaterial) statusMaterial.map = statusTextures.idle;
    } else {
      if (statusMaterial) statusMaterial.map = statusTextures.walking;
    }

    // Procedural Animation for fallback avatars
    if (item.group.userData.leftArm) {
      const time = Date.now() * 0.005;
      const { leftArm, rightArm, leftLeg, rightLeg } = item.group.userData;

      if (item.phase === "walking_to_desk" || item.phase === "walking_from_desk" || item.phase === "walking_to_board") {
        leftArm.rotation.x = Math.sin(time) * 0.5;
        rightArm.rotation.x = -Math.sin(time) * 0.5;
        leftLeg.rotation.x = -Math.sin(time) * 0.5;
        rightLeg.rotation.x = Math.sin(time) * 0.5;
      } else if (item.phase === "working") {
        leftArm.rotation.x = -0.3 + Math.sin(time * 2) * 0.05;
        rightArm.rotation.x = -0.3 + Math.cos(time * 2) * 0.05;
        leftLeg.rotation.x = -0.2;
        rightLeg.rotation.x = -0.2;
      } else if (item.phase === "celebrating") {
        leftArm.rotation.x = -Math.PI + 0.5 + Math.sin(time * 2) * 0.2;
        rightArm.rotation.x = -Math.PI + 0.5 + Math.cos(time * 2) * 0.2;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
      } else {
        // Idle
        leftArm.rotation.x = 0;
        rightArm.rotation.x = 0;
        leftLeg.rotation.x = 0;
        rightLeg.rotation.x = 0;
      }
    }

    // Laser & Floating Terminal Update
    const agentData = agents.find((a) => a.id === item.group.userData.agentId);
    let termEl = document.getElementById(`term-${agentData?.id}`);

    if (item.phase === "working" && agentData?.assignedTask && item.laser) {
      const taskObj = tasks.find((t) => t.id === agentData.assignedTask);
      const cardMesh = kanbanGroup.children.find((c) => c.userData.taskId === agentData.assignedTask);

      if (cardMesh && taskObj) {
        // Laser
        const cardPos = new THREE.Vector3();
        cardMesh.getWorldPosition(cardPos);
        const agentPos = new THREE.Vector3();
        item.group.getWorldPosition(agentPos);
        agentPos.y += 0.8;
        item.laser.geometry.setFromPoints([agentPos, cardPos]);
        item.laser.visible = true;

        // Change laser color based on task category
        const laserColor = (taskObj.category === "test" || taskObj.category === "bug") ? 0xef4444 : (taskObj.category === "performance" ? 0xeab308 : 0x00f0ff);
        (item.laser.material as THREE.LineBasicMaterial).color.setHex(laserColor);

        // Terminal DOM
        if (!termEl) {
          termEl = document.createElement("div");
          termEl.id = `term-${agentData.id}`;
          termEl.className = "agent-terminal";
          els.terminalsLayer?.appendChild(termEl);
        }

        const screenPos = item.group.position.clone();
        screenPos.y += 2.0; // above head
        screenPos.project(camera);
        const px = (screenPos.x * 0.5 + 0.5) * canvas.clientWidth;
        const py = (screenPos.y * -0.5 + 0.5) * canvas.clientHeight;

        termEl.style.left = `${px}px`;
        termEl.style.top = `${py}px`;
        termEl.style.display = "block";

        const lastLog = taskObj.logs && taskObj.logs.length > 0 ? taskObj.logs[taskObj.logs.length - 1] : "Buscando contexto...";
        const newHTML = `<strong>> ${taskObj.title.substring(0, 15)}...</strong><br/><span class="term-log">${lastLog}</span>`;
        if (termEl.innerHTML !== newHTML) {
          termEl.innerHTML = newHTML;
        }

      } else {
        item.laser.visible = false;
        if (termEl) termEl.style.display = "none";
      }
    } else {
      if (item.laser) item.laser.visible = false;
      if (termEl) termEl.style.display = "none";
    }

    // Spawn trail if moving
    if (item.phase !== "idle" && item.phase !== "working" && item.phase !== "at_board" && item.phase !== "celebrating") {
      if (Math.random() < 0.4) {
        spawnTrail(item.group.position, item.color);
      }
    }
  });

  updateVisualAlerts();
  updateConfetti();
  updateTrails();

  // Keep constant corporate lighting, no pulse
  const activeCount = agents.filter(a => a.status === "working").length;
  if (activeCount > 0) {
    dir.intensity = 1.2 + (activeCount * 0.05);
    ambientLight.intensity = 1.5 + (activeCount * 0.05);
  } else {
    dir.intensity = 1.0;
    ambientLight.intensity = 1.5;
  }

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// --- Trail System ---
interface TrailParticle {
  mesh: THREE.Mesh;
  life: number;
}

const trailParticles: TrailParticle[] = [];
const trailGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);

function spawnTrail(position: THREE.Vector3, color: THREE.Color) {
  const mat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.6 });
  const mesh = new THREE.Mesh(trailGeo, mat);
  mesh.position.copy(position);
  mesh.position.y += 0.5; // center of body
  // Random offset for "sparkle"
  mesh.position.x += (Math.random() - 0.5) * 0.2;
  mesh.position.z += (Math.random() - 0.5) * 0.2;
  scene.add(mesh);
  trailParticles.push({ mesh, life: 1.0 });
}

function updateTrails() {
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const p = trailParticles[i];
    p.life -= 0.03;
    p.mesh.scale.setScalar(p.life);
    p.mesh.rotation.x += 0.1;
    p.mesh.rotation.y += 0.1;
    if (p.life <= 0) {
      scene.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
      trailParticles.splice(i, 1);
    }
  }
}

// SSE Connection
const evtSource = new EventSource(`${API_URL}/api/events`);
evtSource.onmessage = (event) => {
  try {
    const msg = JSON.parse(event.data);

    if (msg.terminalUpdate) {
      const update = msg.terminalUpdate as TaskTerminalLog;
      if (activeTaskDetailsId !== null && update.taskId === activeTaskDetailsId && els.taskDetailsModal.open) {
        appendTaskHistoryEntry(update);
      }
    } else if (msg.type === "terminal:data") {
      terminalUIManager.handleTerminalData(msg.agentId, msg.content);
    } else if (msg.type === "terminal:exit") {
      terminalUIManager.handleTerminalExit(msg.agentId, msg.code);
    } else {
      // Default state update
      updateState(msg);
      // Optional: Cleanup dead agent terminals
      if (msg.agents) terminalUIManager.cleanupDeadAgents(msg.agents);
    }
  } catch (e) {
    console.error("Error parsing SSE data", e);
  }
};

// --- Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const tooltip = document.getElementById("agentTooltip") as HTMLElement;

function onPointerDown(event: PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Check clicks on Kanban tasks
  const intersectsTasks = raycaster.intersectObjects(kanbanGroup.children);

  // Create an array of all agent groups for hit testing
  const agentGroupsObjects: THREE.Object3D[] = [];
  agentMeshes.forEach((val) => agentGroupsObjects.push(val.group));
  const intersectsAgents = raycaster.intersectObjects(agentGroupsObjects, true);

  // Hide tooltip by default
  tooltip.style.display = "none";

  if (intersectsTasks.length > 0) {
    const object = intersectsTasks[0].object;
    const taskId = object.userData.taskId;
    const task = tasks.find(t => t.id === taskId);

    if (task) {
      openTaskDetailsModal(task);
      playClickSound();
    }
  } else if (intersectsAgents.length > 0) {
    // Determine which agent was clicked
    const clickedObj = intersectsAgents[0].object;
    // Find the nearest parent group that is in our agent array
    let current: THREE.Object3D | null = clickedObj;
    let foundGroupId: string | null = null;

    while (current && !foundGroupId && current !== scene) {
      agentMeshes.forEach((meshData, agentId) => {
        if (meshData.group === current) {
          foundGroupId = agentId;
        }
      });
      current = current.parent;
    }

    if (foundGroupId) {
      const agent = agents.find(a => a.id === foundGroupId);
      if (agent) {
        let text = `Agente: ${agent.role}\nModelo: ${agent.model}\nStatus: ${agent.status}`;
        if (agent.assignedTask) {
          const task = tasks.find(t => t.id === agent.assignedTask);
          if (task) {
            text += `\nTrabalhando na Task #${task.id}: ${task.title}`;
          } else {
            text += `\nTrabalhando na Task #${agent.assignedTask}`;
          }
        }
        tooltip.textContent = text;
        tooltip.style.left = `${event.clientX}px`;
        tooltip.style.top = `${event.clientY}px`;
        tooltip.style.display = "block";
      }
    }
  }
}

window.addEventListener('pointerdown', onPointerDown);

// --- Keyboard Shortcuts ---
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

  if (e.key === "q" || e.key === "Q") {
    e.preventDefault();
    els.toggleViewBtn.click();
    playClickSound();
  }
  if (e.key === " ") {
    e.preventDefault();
    if (!e.repeat) {
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
    }
  }
  if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    if (els.commandPalette.open) {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
    playClickSound();
  }
  if (e.key === "n" || e.key === "N") {
    const activeEl = document.activeElement as HTMLElement | null;
    const isTypingField = !!activeEl && ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName);
    if (!isTypingField && document.activeElement !== els.commandInput) {
      e.preventDefault();
      openTaskCreateModal();
      playClickSound();
    }
  }
  if (e.key === "Escape") {
    if (els.taskCreateModal.open) els.taskCreateModal.close();
    if (els.taskDetailsModal.open) els.taskDetailsModal.close();
    if (els.agentModal.open) els.agentModal.close();
    if (els.settingsModal.open) els.settingsModal.close();
    if (els.commandPalette.open) closeCommandPalette();
    playClickSound();
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key === " ") {
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  }
});

async function loadAvailableTools() {
  try {
    const res = await fetch(`${API_URL}/api/tools`);
    const data = await res.json() as { tools: { id: string; name: string }[] };
    if (data.tools && data.tools.length > 0) {
      els.driverSelect.innerHTML = data.tools.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
      const agentTypeOptions = '<option value="">Automático / Opcional</option>' + data.tools.map((t) => `<option value="${t.id}">${t.name}</option>`).join("");
      els.agentType.innerHTML = agentTypeOptions;
    }
  } catch (e) {
    console.error("Erro ao carregar ferramentas:", e);
  }
}

loadAvailableTools();
updateTaskAgentModels();
tick();
