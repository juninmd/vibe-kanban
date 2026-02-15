import * as THREE from "https://unpkg.com/three@0.161.0/build/three.module.js";

const lanes = ["backlog", "in_progress", "review", "done"];
const laneLabels = {
  backlog: "Backlog",
  in_progress: "Em progresso",
  review: "Review",
  done: "Concluído",
};

const agents = [
  { id: "pm", role: "Roadmap", model: "gpt-4.1", category: "roadmap", status: "idle" },
  { id: "sec", role: "Segurança", model: "o3-mini", category: "seguranca", status: "idle" },
  { id: "perf", role: "Performance", model: "gpt-4o", category: "performance", status: "idle" },
  { id: "func", role: "Funcionalidades", model: "gpt-4.1-mini", category: "funcionalidades", status: "idle" },
  { id: "tests", role: "Testes", model: "o1", category: "testes", status: "idle" },
  { id: "feat", role: "Features", model: "codex-mini", category: "features", status: "idle" },
];

let taskId = 1;
const tasks = [];
const eventLog = [];

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
};

function addEvent(text) {
  eventLog.unshift(`${new Date().toLocaleTimeString("pt-BR")} — ${text}`);
  if (eventLog.length > 25) eventLog.pop();
}

function createTask({ title, source, category, priority }) {
  tasks.push({
    id: taskId++,
    title,
    source,
    category,
    priority,
    lane: "backlog",
    assignedTo: null,
    interrupted: false,
  });
  addEvent(`Novo card criado por ${source}: ${title}`);
  render();
}

function pickTask(task) {
  const agent = agents.find((a) => a.category === task.category && a.status === "idle");
  if (!agent) {
    addEvent(`Sem agente livre para categoria ${task.category}.`);
    render();
    return;
  }
  task.lane = "in_progress";
  task.assignedTo = agent.id;
  agent.status = "working";
  addEvent(`${agent.role} (${agent.model}) pegou card #${task.id} e foi ao computador.`);
  render();
}

function interruptTask(task) {
  if (task.lane !== "in_progress" || !task.assignedTo) return;
  const agent = agents.find((a) => a.id === task.assignedTo);
  if (agent) agent.status = "idle";
  task.interrupted = true;
  task.assignedTo = null;
  task.lane = "backlog";
  addEvent(`Card #${task.id} interrompido e devolvido ao backlog.`);
  render();
}

function moveTask(task, dir) {
  const idx = lanes.indexOf(task.lane);
  const next = idx + dir;
  if (next < 0 || next >= lanes.length) return;

  if (task.lane === "in_progress" && lanes[next] !== "in_progress" && task.assignedTo) {
    const agent = agents.find((a) => a.id === task.assignedTo);
    if (agent) agent.status = "idle";
    task.assignedTo = null;
  }

  task.lane = lanes[next];
  addEvent(`Card #${task.id} movido para ${laneLabels[task.lane]}.`);
  render();
}

function reprioritize(task, direction) {
  const laneTasks = tasks.filter((t) => t.lane === task.lane);
  const currentIndex = laneTasks.findIndex((t) => t.id === task.id);
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= laneTasks.length) return;

  const currentTaskPos = tasks.findIndex((t) => t.id === task.id);
  const swapWithId = laneTasks[targetIndex].id;
  const swapPos = tasks.findIndex((t) => t.id === swapWithId);
  [tasks[currentTaskPos], tasks[swapPos]] = [tasks[swapPos], tasks[currentTaskPos]];
  addEvent(`Prioridade reordenada no card #${task.id}.`);
  render();
}

function bugFromTask(task) {
  createTask({
    title: `Bug detectado durante: ${task.title}`,
    source: "agente",
    category: "testes",
    priority: "alta",
  });
}

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
        card.innerHTML = `
          <strong>#${task.id} ${task.title}</strong>
          <div class="task-meta">
            <span class="tag">${task.category}</span>
            <span class="tag">${task.priority}</span>
            <span class="tag">fonte: ${task.source}</span>
            <span class="tag">agente: ${assigned}</span>
            ${task.interrupted ? '<span class="tag">interrompido</span>' : ""}
          </div>
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
        actions.append(makeBtn("↑ prioridade", () => reprioritize(task, -1)));
        actions.append(makeBtn("↓ prioridade", () => reprioritize(task, +1)));
        actions.append(makeBtn("+ bug", () => bugFromTask(task)));

        card.append(actions);
        col.append(card);
      });

    els.kanban.append(col);
  });
}

function renderAgents() {
  els.agentsList.innerHTML = agents
    .map(
      (a) => `
      <div class="agent-item">
        <strong>${a.role}</strong>
        <span>Modelo: ${a.model}</span>
        <span>Categoria: ${a.category}</span>
        <span>Status: ${a.status === "idle" ? "Livre" : "Trabalhando"}</span>
      </div>
    `,
    )
    .join("");
}

function renderEvents() {
  els.eventLog.innerHTML = eventLog.map((e) => `<li>${e}</li>`).join("");
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

// 3D scene
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
agents.forEach((agent, index) => {
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.35, 0.9, 4, 8),
    new THREE.MeshStandardMaterial({ color: "#5f78ea" }),
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
  agentMeshes.set(agent.id, { group, target: group.position.clone() });
});

function updateAgents3D() {
  let workstationIndex = 0;
  agents.forEach((agent, idx) => {
    const item = agentMeshes.get(agent.id);
    if (!item) return;

    if (agent.status === "working") {
      item.target.copy(computers[workstationIndex % computers.length]);
      item.target.y = 0;
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

tick();
render();
