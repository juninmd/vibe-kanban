// @ts-nocheck
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const API_URL = "http://localhost:5174";

const ROLE_COLORS = {
  roadmap: 0x4dabf7,
  seguranca: 0xff6b6b,
  performance: 0xfcc419,
  funcionalidades: 0x51cf66,
  testes: 0xcc5de8,
  features: 0x20c997
};
const DEFAULT_COLOR = 0x5f78ea;

type Agent = {
  id: string;
  role: string;
  model: string;
  category: string;
  status: "idle" | "working";
  assignedTask: number | null;
};

type Task = {
  id: number;
  title: string;
  source: string;
  category: string;
  priority: string;
  lane: "backlog" | "in_progress" | "done";
  assignedTo: string | null;
  logs: string[];
  interrupted?: boolean;
};

let tasks: Task[] = [];
let agents: Agent[] = [];
let eventLog: { timestamp: string; text: string }[] = [];

const lanes = ["backlog", "in_progress", "done"];
const laneLabels = {
  backlog: "Backlog",
  in_progress: "Em Progresso",
  done: "Concluído",
};

const els = {
  kanban: document.getElementById("kanbanBoard") as HTMLDivElement,
  agentsList: document.getElementById("agentsList") as HTMLDivElement,
  eventLog: document.getElementById("eventLog") as HTMLUListElement,
  form: document.getElementById("taskForm") as HTMLFormElement,
  title: document.getElementById("taskTitle") as HTMLInputElement,
  source: document.getElementById("taskSource") as HTMLSelectElement,
  category: document.getElementById("taskCategory") as HTMLSelectElement,
  priority: document.getElementById("taskPriority") as HTMLSelectElement,
  driverSelect: document.getElementById("driverSelect") as HTMLSelectElement,
  toggleViewBtn: document.getElementById("toggleViewBtn") as HTMLButtonElement,
  view3d: document.getElementById("view3d") as HTMLDivElement,
  view2d: document.getElementById("view2d") as HTMLDivElement,
  seedTasksBtn: document.getElementById("seedTasksBtn") as HTMLButtonElement,
  resetDataBtn: document.getElementById("resetDataBtn") as HTMLButtonElement,
};

async function fetchState() {
  try {
    const res = await fetch(`${API_URL}/api/state`);
    if (!res.ok) return;
    const data = await res.json();
    tasks = data.tasks || [];
    agents = data.agents || [];
    eventLog = data.events || [];
    render();
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
    // Immediately fetch state to update UI
    await fetchState();
    return await res.json();
  } catch (e) {
    console.error(`API call failed ${endpoint}:`, e);
  }
}

function createTask({ title, source, category, priority }: { title: string; source: string; category: string; priority: string; }) {
  apiCall("/api/tasks", "POST", { title, source, category, priority });
}

function pickTask(task: Task) {
  apiCall("/api/assign", "POST", { taskId: task.id, category: task.category });
}

function interruptTask(task: Task) {
  apiCall("/api/interrupt", "POST", { taskId: task.id });
}

function moveTask(task: Task, dir: number) {
  const idx = lanes.indexOf(task.lane);
  const next = idx + dir;
  if (next < 0 || next >= lanes.length) return;
  apiCall("/api/move", "POST", { taskId: task.id, lane: lanes[next] });
  if (lanes[next] === "done") {
    spawnConfetti(new THREE.Vector3(0, 5, -4));
  }
}

function reprioritize(task: Task, direction: number) {
  apiCall("/api/reorder", "POST", { taskId: task.id, direction });
}

function bugFromTask(task: Task) {
  createTask({
    title: `Bug reportado em: ${task.title}`,
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
  els.agentsList.innerHTML = agents
    .map((a) => `
      <div class="agent-item ${a.status === 'working' ? 'active-agent' : ''}">
        <strong>${a.role}</strong>
        <span>Modelo: ${a.model}</span>
        <span>Categoria: ${a.category}</span>
        <span>Status: ${a.status === "idle" ? "Livre" : "Trabalhando"}</span>
        ${a.assignedTask ? `<span>Task: #${a.assignedTask}</span>` : ""}
      </div>
    `)
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

els.driverSelect?.addEventListener("change", async () => { const driver = els.driverSelect.value; await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driver }) }); });
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
    ["Criar painel de métricas de agente", "usuario", "funcionalidades", "media"]
  ].forEach(([title, source, category, priority]) =>
    createTask({ title: title as string, source: source as string, category: category as string, priority: priority as string }),
  );
});

els.resetDataBtn.addEventListener("click", () => {
  if (confirm("Tem certeza que deseja apagar todos os dados do servidor?")) {
    apiCall("/api/reset", "POST", {});
  }
});

// --- 3D Scene ---
const canvas = document.getElementById("sceneCanvas") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1022");
// scene.fog = new THREE.FogExp2(0x0b1022, 0.02);

const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

scene.add(new THREE.AmbientLight("#ffffff", 0.6));
const dir = new THREE.DirectionalLight("#b7c6ff", 1.5);
dir.position.set(5, 8, 3);
scene.add(dir);

const pointLight = new THREE.PointLight(0x7c95ff, 1, 20);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// Grid
const grid = new THREE.GridHelper(40, 40, 0x30385f, 0x1f2540);
grid.position.y = 0.01;
scene.add(grid);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: "#141c3f", roughness: 0.8, metalness: 0.2 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const kanbanMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), new THREE.MeshStandardMaterial({ color: "#2a376f", emissive: 0x1a2140, emissiveIntensity: 0.5 }));
kanbanMesh.position.set(0, 2, -4.2);
scene.add(kanbanMesh);

const computers: THREE.Vector3[] = [];
for (let i = 0; i < 4; i++) {
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: "#202b56" }));
  desk.position.set(-6 + i * 4, 0.3, 2.8);
  scene.add(desk);
  computers.push(desk.position.clone());
}

// Particles
const particlesGeo = new THREE.BufferGeometry();
const particlesCount = 200;
const posArray = new Float32Array(particlesCount * 3);
for(let i=0; i<particlesCount*3; i++) {
  posArray[i] = (Math.random() - 0.5) * 30;
  if (i % 3 === 1) posArray[i] = Math.random() * 10; // Y
}
particlesGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const particlesMat = new THREE.PointsMaterial({ size: 0.05, color: 0x7c95ff, transparent: true, opacity: 0.5 });
const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
scene.add(particlesMesh);

const agentMeshes = new Map<string, { group: any; label?: any; target: any, body: any }>();

function createAgentMesh(agent: Agent, index: number) {
  const group = new THREE.Group();

  const color = ROLE_COLORS[agent.category] || DEFAULT_COLOR;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: color }));
  body.position.y = 1;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), new THREE.MeshStandardMaterial({ color: "#dce6ff" }));
  head.position.y = 1.9;
  group.add(head);

  group.position.set(-5 + index * 2, 0, -0.5);
  scene.add(group);

  function makeLabelCanvas(text: string) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(20,24,38,0.8)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 28px Inter, sans-serif";
    ctx.fillStyle = "#e6e9ff";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 42);
    return canvas;
  }

  const labelCanvas = makeLabelCanvas(`${agent.role}`);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.encoding = THREE.sRGBEncoding;
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
  const label = new THREE.Sprite(labelMat);
  label.scale.set(2.6, 0.66, 1);
  label.position.set(0, 2.7, 0);
  group.add(label);

  return { group, label, target: group.position.clone(), body };
}

function updateAgents3D() {
  agents.forEach((agent, idx) => {
    if (!agentMeshes.has(agent.id)) {
      agentMeshes.set(agent.id, createAgentMesh(agent, idx));
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

// Confetti
const confetti: { mesh: THREE.Mesh, vel: THREE.Vector3 }[] = [];
function spawnConfetti(pos: THREE.Vector3) {
  for(let i=0; i<30; i++) {
    const geo = new THREE.PlaneGeometry(0.1, 0.1);
    const mat = new THREE.MeshBasicMaterial({ color: Math.random() * 0xffffff, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    mesh.position.x += (Math.random() - 0.5);
    mesh.position.y += (Math.random() - 0.5);

    const vel = new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random())*0.2, (Math.random()-0.5)*0.2);

    scene.add(mesh);
    confetti.push({ mesh, vel });
  }
}

function updateConfetti() {
  for(let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.mesh.position.add(c.vel);
    c.vel.y -= 0.01; // Gravity
    c.mesh.rotation.x += 0.1;
    c.mesh.rotation.y += 0.1;
    if (c.mesh.position.y < 0) {
      scene.remove(c.mesh);
      confetti.splice(i, 1);
    }
  }
}

function tick() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width || canvas.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const time = Date.now() * 0.001;
  agentMeshes.forEach((item, id) => {
    item.group.position.lerp(item.target, 0.08);
    // Bobbing animation
    const agent = agents.find(a => a.id === id);
    if (agent && agent.status === 'idle') {
      item.body.position.y = 1 + Math.sin(time * 3 + id.charCodeAt(0)) * 0.05;
    } else {
       item.body.position.y = 1;
       item.group.rotation.y += 0.01; // Rotate while working
    }
  });

  particlesMesh.rotation.y += 0.001;
  updateConfetti();

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// Initial fetch and polling
fetchState();
setInterval(fetchState, 1000);

tick();
