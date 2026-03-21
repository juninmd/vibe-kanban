import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { createOffice } from "./office.js";
import { getLaneSafe, getTaskCardPosition, shouldRenderTaskIn3D } from "./kanbanMath.js";

const API_URL = "";

type Agent = {
  id: string;
  role: string;
  model: string;
  category: string;
  status: "idle" | "working";
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
};

type EventLog = {
  timestamp: string;
  text: string;
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
let pendingStateData: any = null;

const els = {
  form: document.getElementById("taskForm") as HTMLFormElement,
  source: document.getElementById("taskSource") as HTMLSelectElement,
  title: document.getElementById("taskTitle") as HTMLInputElement,
  category: document.getElementById("taskCategory") as HTMLSelectElement,
  priority: document.getElementById("taskPriority") as HTMLSelectElement,
  githubRepo: document.getElementById("taskGithubRepo") as HTMLInputElement,
  description: document.getElementById("taskDescription") as HTMLTextAreaElement,
  agentType: document.getElementById("taskAgentType") as HTMLInputElement,
  agentAssign: document.getElementById("taskAgentAssign") as HTMLSelectElement,
  agentModel: document.getElementById("taskAgentModel") as HTMLSelectElement,
  driverSelect: document.getElementById("driverSelect") as HTMLSelectElement,
  kanban: document.getElementById("kanbanBoard") as HTMLElement,
  agentsList: document.getElementById("agentsList") as HTMLElement,
  eventLog: document.getElementById("eventLog") as HTMLElement,
  view3d: document.getElementById("view3d") as HTMLElement,
  view2d: document.getElementById("view2d") as HTMLElement,
  toggleViewBtn: document.getElementById("toggleViewBtn") as HTMLButtonElement,
  seedTasksBtn: document.getElementById("seedTasksBtn") as HTMLButtonElement,
  resetDataBtn: document.getElementById("resetDataBtn") as HTMLButtonElement,
  clearDoneBtn: document.getElementById("clearDoneBtn") as HTMLButtonElement,
  createAgentBtn: document.getElementById("createAgentBtn") as HTMLButtonElement,
  settingsBtn: document.getElementById("settingsBtn") as HTMLButtonElement,
  agentModal: document.getElementById("agentModal") as HTMLDialogElement,
  agentForm: document.getElementById("agentForm") as HTMLFormElement,
  cancelAgentBtn: document.getElementById("cancelAgentBtn") as HTMLButtonElement,
  agentTool: document.getElementById("agentTool") as HTMLSelectElement,
  agentModelDropdown: document.getElementById("agentModel") as HTMLSelectElement,
  settingsModal: document.getElementById("settingsModal") as HTMLDialogElement,
  settingsForm: document.getElementById("settingsForm") as HTMLFormElement,
  cancelSettingsBtn: document.getElementById("cancelSettingsBtn") as HTMLButtonElement,
  configCloneDir: document.getElementById("configCloneDir") as HTMLInputElement,
  envOpenAI: document.getElementById("envOpenAI") as HTMLInputElement,
  envGemini: document.getElementById("envGemini") as HTMLInputElement,
  envAnthropic: document.getElementById("envAnthropic") as HTMLInputElement,
  envGithub: document.getElementById("envGithub") as HTMLInputElement,
  // Stats
  statPending: document.getElementById("statPending") as HTMLElement,
  statDone: document.getElementById("statDone") as HTMLElement,
  statAgents: document.getElementById("statAgents") as HTMLElement,
  headerStats: document.getElementById("headerStats") as HTMLElement,
  toastContainer: document.getElementById("toast-container") as HTMLElement,
  agentEditId: document.getElementById("agentEditId") as HTMLInputElement,
  agentRole: document.getElementById("agentRole") as HTMLInputElement,
  agentCategory: document.getElementById("agentCategory") as HTMLSelectElement,
  agentModalTitle: document.getElementById("agentModalTitle") as HTMLElement,
  agentSubmitBtn: document.getElementById("agentSubmitBtn") as HTMLButtonElement,
  // New Terminal UI
  terminalsLayer: document.getElementById("terminalsLayer") as HTMLElement,
  terminalsContainer: document.getElementById("terminalsContainer") as HTMLElement,
  terminalsTabs: document.getElementById("terminalsTabs") as HTMLElement,
  terminalsContent: document.getElementById("terminalsContent") as HTMLElement,
  closeAllTerminalsBtn: document.getElementById("closeAllTerminalsBtn") as HTMLButtonElement,
};

// --- Toast System ---
function showToast(message: string, type: "success" | "error" | "info" = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer?.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "fadeOut 0.5s forwards";
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// --- Sound System ---
const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
function playTone(freq: number, type: OscillatorType, dur: number, vol: number) {
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + dur);
  } catch (e) { }
}

function playSuccessSound() { playTone(880, "sine", 0.3, 0.2); playTone(1100, "sine", 0.4, 0.1); }
function playErrorSound() { playTone(220, "sawtooth", 0.4, 0.3); }
function playClickSound() { playTone(1200, "triangle", 0.05, 0.05); }

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

// Confetti State
const confettiParticles: any[] = [];

let isOfficeCreated = false;
export let officeData: { padPositions: THREE.Vector3[] } = { padPositions: [] };

function updateState(data: any) {
  pendingStateData = data;
  if (stateUpdateQueued) return;
  stateUpdateQueued = true;

  requestAnimationFrame(() => {
    const data = pendingStateData;
    stateUpdateQueued = false;

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
      spawnDesks();
    }

    eventLog = data.events || [];
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

async function apiCall(endpoint: string, method: string, body: any) {
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

function createTask(taskParams: { title: string; source: string; category: string; priority: string; githubRepo?: string; description?: string; agentType?: string; assignedTo?: string; model?: string; }) {
  apiCall("/api/tasks", "POST", taskParams);
  playSuccessSound();
  showToast(`Tarefa criada: ${taskParams.title}`, "success");
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
  createTask({
    title: `Bug reportado em: ${task.title}`,
    source: "agente",
    category: "bug",
    priority: "alta",
    githubRepo: task.githubRepo,
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
declare var Terminal: any;
declare var FitAddon: any;
declare var WebLinksAddon: any;

class TerminalInstance {
  term: any;
  fitAddon: any;
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
        background: "#000000",
        foreground: "#00f0ff",
        cursor: "#ff0055",
        black: "#000000",
        red: "#ef4444",
        green: "#22c55e",
        yellow: "#eab308",
        blue: "#3b82f6",
        magenta: "#a855f7",
        cyan: "#06b6d4",
        white: "#e2e8f0"
      }
    });

    this.fitAddon = new FitAddon.FitAddon();
    this.term.loadAddon(this.fitAddon);
    this.term.loadAddon(new WebLinksAddon.WebLinksAddon());

    this.term.open(this.container);
    this.fitAddon.fit();

    this.term.onData((data: string) => {
      fetch(`/api/terminals/${encodeURIComponent(agentId)}/send`, {
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
        await fetch(`/api/terminals/${encodeURIComponent(agentId)}/start`, { method: "POST" });
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
    const data = await res.json();
    if (data.tools && data.tools.length > 0) {
      els.agentTool.innerHTML = '<option value="">Selecione a ferramenta</option>' + data.tools.map((t: any) => `<option value="${t.id}"${t.id === agent.tool ? ' selected' : ''}>${t.name}</option>`).join("");
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
els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  createTask({
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
  els.title.value = "";
  if (els.description) els.description.value = "";
  if (els.githubRepo) els.githubRepo.value = "";
  if (els.agentType) els.agentType.value = "";
  if (els.agentAssign) els.agentAssign.value = "";
});

els.toggleViewBtn.addEventListener("click", () => {
  els.view3d.classList.toggle("active");
  els.view2d.classList.toggle("active");
});

els.seedTasksBtn.addEventListener("click", () => {
  [
    ["Planejar sprint de IA colaborativa", "product_manager", "roadmap", "alta"],
    ["Auditar permissões do backend", "product_manager", "security", "alta"],
    ["Otimizar render do quadro 3D", "usuario", "performance", "media"],
    ["Criar painel de métricas de agente", "usuario", "feature", "media"]
  ].forEach(([title, source, category, priority]) =>
    createTask({ title: title as string, source: source as string, category: category as string, priority: priority as string }),
  );
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

// --- Modals Logic ---
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
    const data = await res.json();
    if (data.tools && data.tools.length > 0) {
      els.agentTool.innerHTML = '<option value="">Selecione a ferramenta</option>' + data.tools.map((t: any) => `<option value="${t.id}">${t.name}</option>`).join("");
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

els.cancelSettingsBtn.addEventListener("click", () => els.settingsModal.close());

els.settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  // Save clone dir
  await apiCall("/api/config/clone-dir", "POST", { cloneDir: els.configCloneDir.value });

  // Save env vars
  const envUpdates: Record<string, string> = {};
  if (els.envOpenAI.value) envUpdates["OPENAI_API_KEY"] = els.envOpenAI.value;
  if (els.envGemini.value) envUpdates["GEMINI_API_KEY"] = els.envGemini.value;
  if (els.envAnthropic.value) envUpdates["ANTHROPIC_API_KEY"] = els.envAnthropic.value;
  if (els.envGithub.value) envUpdates["GITHUB_TOKEN"] = els.envGithub.value;

  if (Object.keys(envUpdates).length > 0) {
    await apiCall("/api/settings/env", "POST", envUpdates);
    showToast("Configurações e API Keys salvas!", "success");
    // Clear password fields for security
    els.envOpenAI.value = "";
    els.envGemini.value = "";
    els.envAnthropic.value = "";
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
scene.background = new THREE.Color("#0b1022");
const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, 0);

const ambientLight = new THREE.AmbientLight("#ffffff", 0.75);
scene.add(ambientLight);
const dir = new THREE.DirectionalLight("#b7c6ff", 1.2);
dir.position.set(5, 8, 3);
scene.add(dir);

// Holographic Floor Grid
const gridHelper = new THREE.GridHelper(40, 40, 0x00f0ff, 0x111133);
gridHelper.position.y = -0.01;
(gridHelper.material as THREE.Material).transparent = true;
(gridHelper.material as THREE.Material).opacity = 0.2;
scene.add(gridHelper);

function updateLighting() {
  const workingCount = agents.filter(a => a.status === "working").length;
  // Target intensity: brighter when busy
  const targetDir = workingCount > 0 ? 1.8 : 0.8;
  const targetAmb = workingCount > 0 ? 0.9 : 0.4;

  dir.intensity += (targetDir - dir.intensity) * 0.05;
  ambientLight.intensity += (targetAmb - ambientLight.intensity) * 0.05;
}

// Office data is now populated dynamically when state loads

// Ambient Particles
const pGeo = new THREE.BufferGeometry();
const particleCount = 1000;
const pPos = new Float32Array(particleCount * 3);
for (let i = 0; i < particleCount; i++) {
  pPos[i * 3] = (Math.random() - 0.5) * 30; // x
  pPos[i * 3 + 1] = Math.random() * 8; // y
  pPos[i * 3 + 2] = (Math.random() - 0.5) * 15; // z
}
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0x00f0ff, size: 0.05, transparent: true, opacity: 0.6 });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

let robotModel: THREE.Group | null = null;
let robotAnimations: THREE.AnimationClip[] = [];
const loader = new GLTFLoader();
let usingFallbackAvatars = false;

loader.load("/models/RobotExpressive.glb", (gltf) => {
  robotModel = gltf.scene;
  robotAnimations = gltf.animations;

  robotModel.traverse((child: any) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  console.log("Robot animations loaded:", robotAnimations.map(a => a.name));
  usingFallbackAvatars = false;
  rebuildAgentMeshes();
}, undefined, (error) => {
  console.error("Falha ao carregar modelo 3D do robô. Usando avatar fallback.", error);
  usingFallbackAvatars = true;
  rebuildAgentMeshes();
});

// Desk generation (simple box desks without old_computer model)
function spawnDesks() {
  officeData.padPositions.forEach((pos) => {
    const deskGeo = new THREE.BoxGeometry(2.0, 1.0, 1.2);
    const deskMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.2, metalness: 0.5 });
    const desk = new THREE.Mesh(deskGeo, deskMat);
    desk.position.set(pos.x, 0.5, pos.z - 1.2);
    scene.add(desk);

    // Simple monitor placeholder
    const monGeo = new THREE.BoxGeometry(0.9, 0.6, 0.05);
    const monMat = new THREE.MeshStandardMaterial({ color: "#0ea5e9", emissive: 0x003344, emissiveIntensity: 0.6 });
    const monitor = new THREE.Mesh(monGeo, monMat);
    monitor.position.set(0, 0.8, 0);
    desk.add(monitor);
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

const kanbanMesh = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.2), new THREE.MeshStandardMaterial({ color: "#2a376f" }));
kanbanMesh.position.set(0, 3, -4.2);
// Add column separators
for (let i = -1; i <= 1; i++) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.075, 5.7, 0.05), new THREE.MeshStandardMaterial({ color: "#5ea6ff" }));
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
  group: any;
  label?: any;
  target: any;
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

function createStatusTexture(emoji: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "48px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 32, 34);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

const statusTextures = {
  idle: createStatusTexture("💤"),
  working: createStatusTexture("🔨"),
  celebrating: createStatusTexture("🎉"),
  walking: createStatusTexture("🚶")
};

function createAlertIcon(type: "bug" | "perf") {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = type === "bug" ? "#ef4444" : "#eab308";
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 80px Inter, sans-serif";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(type === "bug" ? "!" : "⚡", 64, 68);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.6, 0.6, 1);
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
        cardMesh.getWorldPosition(worldPos);
        sprite.position.copy(worldPos);
        sprite.position.y += 0.6;
        sprite.position.z += 0.2;
        // Floating effect
        sprite.position.y += Math.sin(Date.now() * 0.005) * 0.1;
      }
    }
  }
}

function playAction(item: any, name: string, duration = 0.5) {
  if (!item.anims) return;
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

  const roleColors: Record<string, string> = {
    "Product Manager": "#a855f7",
    "Segurança": "#ef4444",
    "Performance": "#f97316",
    "Novas Funcionalidades": "#3b82f6",
    "Testes": "#22c55e",
    "Correções / Bugs": "#06b6d4"
  };
  const color = new THREE.Color(roleColors[agent.role] || "#888888");

  let mixer: THREE.AnimationMixer | undefined;
  let anims: Record<string, THREE.AnimationAction> | undefined;

  if (robotModel && !usingFallbackAvatars) {
    const clonedRobot = SkeletonUtils.clone(robotModel) as THREE.Group;
    clonedRobot.scale.set(0.45, 0.45, 0.45); // increased height
    clonedRobot.position.y = 0;
    group.add(clonedRobot);

    clonedRobot.traverse((child: any) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        if (child.name !== "Face") {
          child.material.color.lerp(color, 0.7);
        }
      }
    });

    mixer = new THREE.AnimationMixer(clonedRobot);
    anims = {};
    robotAnimations.forEach(clip => {
      anims![clip.name] = mixer!.clipAction(clip);
    });
  } else {
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.25, 0.8, 4, 8),
      new THREE.MeshStandardMaterial({ color })
    );
    body.position.y = 0.8;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({ color: "#dbeafe" })
    );
    head.position.y = 1.45;
    group.add(head);
  }

  group.position.set(-5 + index * 2, 0, -0.5);
  scene.add(group);

  function makeLabelCanvas(text: string, colorHex: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;

    // Convert hex to rgba for transparency
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.9)`;

    // Rounded rect background for badge look
    ctx.beginPath();
    ctx.roundRect(0, 0, canvas.width, canvas.height, 40);
    ctx.fill();

    // Add a border
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 16;
    ctx.stroke();

    ctx.font = "bold 160px 'Share Tech Mono', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Shadow for better readability
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 10);
    return canvas;
  }

  // Determine badge color based on tool/model
  const tool = agent.tool || "unknown";
  const toolColorMap: Record<string, string> = {
    openai: "#10a37f",
    gemini: "#4285f4",
    copilot: "#6f42c1",
    opencode: "#f97316",
    claude: "#d97757",
  };
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";
  const toolKey = Object.keys(toolColorMap).find(key => tool.includes(key));
  const badgeColor = toolKey ? toolColorMap[toolKey] : "#555555";

  const labelCanvas = makeLabelCanvas(`${agent.model}`, badgeColor);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
  const label = new THREE.Sprite(labelMat);
  // Scale down to badge size
  label.scale.set(0.6, 0.15, 1);
  label.renderOrder = 999;
  // Position on chest
  label.position.set(0, 1.35, 0.25);
  group.add(label);

  const statusMat = new THREE.SpriteMaterial({ map: createStatusTexture("💤"), transparent: true, depthTest: false });
  const statusSprite = new THREE.Sprite(statusMat);
  statusSprite.scale.set(0.4, 0.4, 1);
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

  // Check if we need to create meshes for new agents
  agents.forEach((agent, idx) => {
    if (!agentMeshes.has(agent.id)) {
      const meshData = createAgentMesh(agent, idx);
      agentMeshes.set(agent.id, {
        ...meshData,
        phase: "idle",
        phaseTimer: 0
      });
      playAction(agentMeshes.get(agent.id), "Idle", 0);
    }
  });

  agents.forEach((agent, idx) => {
    const item = agentMeshes.get(agent.id);
    if (!item) return;

    // Spread agents out more: -8 to +8 roughly
    const spawnPos = new THREE.Vector3(-8 + idx * 3, 0, -1.0);
    const pads = officeData.padPositions;
    const deskIdx = idx % (pads.length || 1);

    // Safe check for computers array
    const deskPos = pads[deskIdx] ? pads[deskIdx].clone() : spawnPos.clone();
    deskPos.y = 0.5;

    // Working Animation is now standing (Idle) since there's no desk
    const workingAnim = "Idle";

    if (item.phase === "celebrating") {
      // Logic for celebrating happens inside tick() loop, just skip overriding it here.
    } else if (agent.status === "working") {
      if (item.phase === "idle" || item.phase === "walking_from_desk") {
        item.phase = "walking_to_desk";
        item.target.copy(deskPos);
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
      item.group.rotation.set(0, Math.PI, 0); // Face forward towards camera (Kanban board is at z=-4.2, camera is at z=12, so Math.PI faces the camera)
    } else {
      item.group.rotation.set(0, Math.PI, 0);
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

  if (typeof particles !== "undefined") particles.rotation.y += 0.0005;

  updateVisualAlerts();
  updateConfetti();
  updateTrails();

  // Pulse lighting based on active agents
  const activeCount = agents.filter(a => a.status === "working").length;
  if (activeCount > 0) {
    const pulse = Math.sin(Date.now() * 0.002) * 0.1;
    dir.intensity = 1.2 + (activeCount * 0.1) + pulse;
    ambientLight.intensity = 0.75 + (activeCount * 0.05) + (pulse * 0.5);
  } else {
    // Calm breathing when idle
    const pulse = Math.sin(Date.now() * 0.001) * 0.05;
    dir.intensity = 1.0 + pulse;
    ambientLight.intensity = 0.6 + pulse;
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

    if (msg.type === "terminal:data") {
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
      alert(`Task #${task.id}\nTitle: ${task.title}\nCategory: ${task.category}\nAssigned: ${task.assignedTo || "None"}`);
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

  if (e.key === " ") {
    e.preventDefault();
    els.toggleViewBtn.click();
    playClickSound();
  }
  if (e.key === "n" || e.key === "N") {
    e.preventDefault();
    els.title.focus();
    playClickSound();
  }
  if (e.key === "Escape") {
    els.agentModal.close();
    els.settingsModal.close();
    playClickSound();
  }
});

updateTaskAgentModels();
tick();
