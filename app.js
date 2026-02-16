import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const API_URL = "http://localhost:5174";

const lanes = ["backlog", "in_progress", "review", "done"];
const laneLabels = {
  backlog: "Backlog",
  in_progress: "Em progresso",
  review: "Review",
  done: "Concluído",
};

// State is now managed by server, but we keep a local copy for rendering
let agents = [];
let tasks = [];
let eventLog = [];

const els = {
  form: document.getElementById("taskForm"),
  source: document.getElementById("taskSource"),
  title: document.getElementById("taskTitle"),
  category: document.getElementById("taskCategory"),
  priority: document.getElementById("taskPriority"),
  kanban: document.getElementById("kanbanBoard"),
  agentsList: document.getElementById("agentsList"),
  eventLog: document.getElementById("eventLog"),
  view3d: document.getElementById("view3d"),
  view2d: document.getElementById("view2d"),
  toggleViewBtn: document.getElementById("toggleViewBtn"),
  seedTasksBtn: document.getElementById("seedTasksBtn"),
  resetDataBtn: document.getElementById("resetDataBtn"),
};

// --- API Helpers ---
async function fetchState() {
  try {
    const res = await fetch(`${API_URL}/api/state`);
    const data = await res.json();
    tasks = data.tasks || [];
    agents = data.agents || [];
    eventLog = data.events || [];
    render();
  } catch (e) {
    console.error("Failed to fetch state:", e);
  }
}

async function apiCall(endpoint, method, body) {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await fetchState();
    return await res.json();
  } catch (e) {
    console.error(`API call failed ${endpoint}:`, e);
  }
}

// --- Actions ---
function createTask({ title, source, category, priority }) {
  apiCall("/api/tasks", "POST", { title, source, category, priority });
}

function pickTask(task) {
  // Auto-assign based on category logic is done on server, but we can also pass specific agent if we want
  // Here we just trigger assignment for the task
  apiCall("/api/assign", "POST", { taskId: task.id, category: task.category });
}

function interruptTask(task) {
  apiCall("/api/interrupt", "POST", { taskId: task.id });
}

function moveTask(task, dir) {
  const idx = lanes.indexOf(task.lane);
  const next = idx + dir;
  if (next < 0 || next >= lanes.length) return;

  apiCall("/api/move", "POST", { taskId: task.id, lane: lanes[next] });
}

function bugFromTask(task) {
  // Actually, server handles bug creation logic automatically if enabled,
  // but user can also manually create one.
  createTask({
    title: `Bug reportado em: ${task.title}`,
    source: "usuario",
    category: "testes",
    priority: "alta",
  });
}

function reprioritize(task, dir) {
  // Not implemented in backend yet fully (reordering array),
  // but frontend needs it. For MVP, we skip or mock it.
  console.log("Reprioritize not fully implemented on server");
}

// --- Rendering ---
function renderKanban() {
  els.kanban.innerHTML = "";

  lanes.forEach((lane) => {
    const col = document.createElement("div");
    col.className = "column";
    col.innerHTML = `<h3>${laneLabels[lane]}</h3>`;

    tasks
      .filter((task) => task.lane === lane)
      .forEach((task) => {
        const card = document.createElement("article");
        card.className = `task-card priority-${task.priority}`;
        const assigned = task.assignedTo ? agents.find((a) => a.id === task.assignedTo)?.role : "-";

        // Logs preview
        const lastLog = task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : "";

        card.innerHTML = `
          <strong>#${task.id} ${task.title}</strong>
          <div class="task-meta">
            <span class="tag">${task.category}</span>
            <span class="tag">${task.priority}</span>
            <span class="tag">fonte: ${task.source}</span>
            <span class="tag">agente: ${assigned}</span>
            ${task.interrupted ? '<span class="tag">interrompido</span>' : ""}
          </div>
          ${lastLog ? `<div style="font-size:0.8em; margin-top:5px; color:#aaa;">> ${lastLog}</div>` : ""}
        `;

        const actions = document.createElement("div");
        actions.className = "task-actions";

        const makeBtn = (txt, onClick) => {
          const btn = document.createElement("button");
          btn.textContent = txt;
          btn.onclick = onClick;
          return btn;
        };

        if (lane === "backlog") actions.append(makeBtn("Pegar tarefa", () => pickTask(task)));
        if (lane === "in_progress") actions.append(makeBtn("Interromper", () => interruptTask(task)));

        actions.append(makeBtn("←", () => moveTask(task, -1)));
        actions.append(makeBtn("→", () => moveTask(task, +1)));
        // actions.append(makeBtn("↑ prioridade", () => reprioritize(task, -1)));
        // actions.append(makeBtn("↓ prioridade", () => reprioritize(task, +1)));
        actions.append(makeBtn("+ bug", () => bugFromTask(task)));

        card.append(actions);
        col.append(card);
      });

    els.kanban.append(col);
  });
}

function renderAgents() {
  if (agents.length === 0) {
      els.agentsList.innerHTML = "<div>Carregando agentes...</div>";
      return;
  }
  els.agentsList.innerHTML = agents
    .map(
      (a) => `
      <div class="agent-item">
        <strong>${a.role}</strong>
        <span>Modelo: ${a.model}</span>
        <span>Categoria: ${a.category}</span>
        <span>Status: ${a.status === "idle" ? "Livre" : "Trabalhando"}</span>
        ${a.assignedTask ? `<span>Task: #${a.assignedTask}</span>` : ""}
      </div>
    `,
    )
    .join("");
}

function renderEvents() {
  els.eventLog.innerHTML = eventLog.map((e) => `<li>${e.timestamp} — ${e.text}</li>`).join("");
}

function render() {
  renderKanban();
  renderAgents();
  renderEvents();
  updateAgents3D();
}

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  createTask({
    title: els.title.value.trim(),
    source: els.source.value,
    category: els.category.value,
    priority: els.priority.value,
  });
  els.title.value = "";
});

els.toggleViewBtn.addEventListener("click", () => {
  els.view3d.classList.toggle("active");
  els.view2d.classList.toggle("active");
});

els.seedTasksBtn.addEventListener("click", () => {
  [
    ["Planejar sprint de IA colaborativa", "product_manager", "roadmap", "alta"],
    ["Auditar permissões do backend", "product_manager", "seguranca", "alta"],
    ["Otimizar render do quadro 3D", "usuario", "performance", "media"],
    ["Criar painel de métricas de agente", "usuario", "funcionalidades", "media"],
  ].forEach(([title, source, category, priority]) => createTask({ title, source, category, priority }));
});

els.resetDataBtn.addEventListener("click", () => {
  if (confirm("Tem certeza que deseja apagar todos os dados e recarregar?")) {
    apiCall("/api/reset", "POST", {});
  }
});

// --- 3D Scene ---
const canvas = document.getElementById("sceneCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1022");

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, 0);

scene.add(new THREE.AmbientLight("#ffffff", 0.75));
const dir = new THREE.DirectionalLight("#b7c6ff", 1.2);
dir.position.set(5, 8, 3);
scene.add(dir);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(24, 14),
  new THREE.MeshStandardMaterial({ color: "#141c3f" }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const kanbanMesh = new THREE.Mesh(
  new THREE.BoxGeometry(8, 4, 0.2),
  new THREE.MeshStandardMaterial({ color: "#2a376f" }),
);
kanbanMesh.position.set(0, 2, -4.2);
scene.add(kanbanMesh);

const computers = [];
for (let i = 0; i < 4; i++) {
  const desk = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.6, 1.2),
    new THREE.MeshStandardMaterial({ color: "#202b56" }),
  );
  desk.position.set(-6 + i * 4, 0.3, 2.8);
  scene.add(desk);
  computers.push(desk.position.clone());
}

const agentMeshes = new Map();

// Helper to create agent mesh
function createAgentMesh(agent, index) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: ["#5f78ea", "#e07a5f", "#7bd389", "#f2c94c", "#9b7cff", "#5fc3d3"][index % 6] }),
  );
  body.position.y = 1;
  group.add(body);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 16, 16),
    new THREE.MeshStandardMaterial({ color: "#dce6ff" }),
  );
  head.position.y = 1.9;
  group.add(head);
  group.position.set(-5 + index * 2, 0, -0.5);
  scene.add(group);

  // Label
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20,24,38,0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "28px Inter, sans-serif";
  ctx.fillStyle = "#e6e9ff";
  ctx.textAlign = "center";
  ctx.fillText(agent.model, canvas.width / 2, 42);

  const labelTex = new THREE.CanvasTexture(canvas);
  labelTex.encoding = THREE.sRGBEncoding;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, transparent: true }));
  label.scale.set(2.6, 0.66, 1);
  label.position.set(0, 2.7, 0);
  group.add(label);

  return { group, label, target: group.position.clone() };
}

function updateAgents3D() {
  // Sync meshes with agents list
  // If agents array changes (reloaded from server), we might need to recreate meshes or update props
  // For now assuming constant agent list for visual simplicity or we check existence

  agents.forEach((agent, idx) => {
     let item = agentMeshes.get(agent.id);
     if (!item) {
        item = createAgentMesh(agent, idx);
        agentMeshes.set(agent.id, item);
     }
  });

  let workstationIndex = 0;
  agents.forEach((agent, idx) => {
    const item = agentMeshes.get(agent.id);
    if (!item) return;

    if (agent.status === "working") {
      const wp = computers[workstationIndex % computers.length].clone();
      item.target.copy(wp);
      item.target.y = 0.5;
      workstationIndex += 1;
    } else {
      item.target.set(-5 + idx * 2, 0, -0.5);
    }
  });
}

function tick() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  agentMeshes.forEach((item) => {
    item.group.position.lerp(item.target, 0.08);
  });

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Initial load and polling
fetchState();
setInterval(fetchState, 1000); // Poll every second

tick();
