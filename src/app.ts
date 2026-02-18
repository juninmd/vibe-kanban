// @ts-nocheck
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const API_URL = "http://localhost:5174";

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
  lane: string;
  assignedTo: string | null;
  interrupted?: boolean;
  logs?: string[];
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
let previousTasks: Task[] = []; // To track changes

const els = {
  form: document.getElementById("taskForm") as HTMLFormElement,
  source: document.getElementById("taskSource") as HTMLSelectElement,
  title: document.getElementById("taskTitle") as HTMLInputElement,
  category: document.getElementById("taskCategory") as HTMLSelectElement,
  priority: document.getElementById("taskPriority") as HTMLSelectElement,
  driverSelect: document.getElementById("driverSelect") as HTMLSelectElement,
  kanban: document.getElementById("kanbanBoard") as HTMLElement,
  agentsList: document.getElementById("agentsList") as HTMLElement,
  eventLog: document.getElementById("eventLog") as HTMLElement,
  view3d: document.getElementById("view3d") as HTMLElement,
  view2d: document.getElementById("view2d") as HTMLElement,
  toggleViewBtn: document.getElementById("toggleViewBtn") as HTMLButtonElement,
  seedTasksBtn: document.getElementById("seedTasksBtn") as HTMLButtonElement,
  resetDataBtn: document.getElementById("resetDataBtn") as HTMLButtonElement,
};

// Confetti State
const confettiParticles: any[] = [];

function updateState(data: any) {
  // Detect completions for celebration
  const newTasks = data.tasks || [];
  newTasks.forEach((t: Task) => {
    const old = previousTasks.find((pt) => pt.id === t.id);
    if (old && old.lane !== "done" && t.lane === "done") {
      spawnConfetti();
    }
  });
  previousTasks = JSON.parse(JSON.stringify(newTasks));

  tasks = newTasks;
  agents = data.agents || [];
  eventLog = data.events || [];
  render();
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

        // Highlight auto-assigned tasks
        const isAuto = task.source === "system" || (!task.source && task.assignedTo);

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
      <div class="agent-item">
        <strong>${a.role}</strong>
        <span>Modelo: ${a.model}</span>
        <span>Categoria: ${a.category}</span>
        <span>Status: ${a.status === "idle" ? "Livre" : "Trabalhando"}</span>
        ${a.assignedTask ? `<span>Task: #${a.assignedTask}</span>` : ""}
      </div>
    `)
    .join("");
}

function addEvent(text: string) {
  // Local event log update (optional, but good for immediate feedback if SSE is slow)
  // But strictly we should rely on state from server to be single source of truth
  // So I'll comment this out and let SSE handle it
  // eventLog.unshift({ timestamp: new Date().toLocaleTimeString(), text });
  // renderEvents();
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

els.driverSelect?.addEventListener("change", async () => { const driver = els.driverSelect.value; await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driver }) }); /* addEvent("Driver alterado: " + driver); */ });
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

const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), new THREE.MeshStandardMaterial({ color: "#141c3f" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(24, 24, 0x30385f, 0x1b2241);
grid.position.y = 0.01;
scene.add(grid);

// Ambient Particles
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(600);
for(let i=0; i<600; i++) pPos[i] = (Math.random() - 0.5) * 20;
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 0.05, transparent: true, opacity: 0.4 });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

// Confetti System
function spawnConfetti() {
  const geometry = new THREE.BufferGeometry();
  const count = 150;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];

  for(let i=0; i<count; i++) {
    positions[i*3] = 0; // x (center)
    positions[i*3+1] = 5; // y (high up)
    positions[i*3+2] = -4; // z (near board)

    const color = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
    colors[i*3] = color.r;
    colors[i*3+1] = color.g;
    colors[i*3+2] = color.b;

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
  for(let i=confettiParticles.length-1; i>=0; i--) {
     const p = confettiParticles[i];
     p.age++;
     const positions = p.mesh.geometry.attributes.position.array;

     for(let j=0; j<p.velocities.length; j++) {
        p.velocities[j].y -= 0.005; // Gravity
        positions[j*3] += p.velocities[j].x;
        positions[j*3+1] += p.velocities[j].y;
        positions[j*3+2] += p.velocities[j].z;
     }
     p.mesh.geometry.attributes.position.needsUpdate = true;

     if(p.age > 200) {
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

const kanbanMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), new THREE.MeshStandardMaterial({ color: "#2a376f" }));
kanbanMesh.position.set(0, 2, -4.2);
// Add column separators
for (let i = -1; i <= 1; i++) {
  const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.8, 0.05), new THREE.MeshStandardMaterial({ color: "#5ea6ff" }));
  line.position.set(i * 2, 0, 0.11);
  kanbanMesh.add(line);
}
scene.add(kanbanMesh);

const computers: THREE.Vector3[] = [];
for (let i = 0; i < 4; i++) {
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: "#202b56" }));
  desk.position.set(-6 + i * 4, 0.3, 2.8);
  scene.add(desk);
  computers.push(desk.position.clone());
}

const agentMeshes = new Map<string, {
  group: any;
  label?: any;
  target: any;
  phase: "idle" | "walking_to_board" | "at_board" | "walking_to_desk" | "working";
  phaseTimer: number;
}>();

function createAgentMesh(agent: Agent, index: number) {
  const group = new THREE.Group();

  const roleColors: Record<string, string> = {
    "Product Manager": "#a855f7",
    "Segurança": "#ef4444",
    "Performance": "#f97316",
    "Novas Funcionalidades": "#3b82f6",
    "Testes": "#22c55e",
    "Novas Features": "#06b6d4"
  };

  const colorHex = roleColors[agent.role] || "#888888";
  const color = new THREE.Color(colorHex);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
  body.position.y = 1;
  group.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), new THREE.MeshStandardMaterial({ color: "#dce6ff" }));
  head.position.y = 1.9;
  group.add(head);

  // Visor
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.2 }));
  visor.position.set(0, 1.92, 0.22);
  group.add(visor);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
  const armMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.1 });

  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.5, 1.2, 0);
  leftArm.rotation.z = -0.2;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.position.set(0.5, 1.2, 0);
  rightArm.rotation.z = 0.2;
  group.add(rightArm);

  group.position.set(-5 + index * 2, 0, -0.5);
  scene.add(group);

  function makeLabelCanvas(text: string) {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(20,24,38,0.95)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 36px Inter, sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.fillText(text, canvas.width / 2, 52);
    return canvas;
  }

  const labelCanvas = makeLabelCanvas(`${agent.model}`);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.encoding = THREE.sRGBEncoding;
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true });
  const label = new THREE.Sprite(labelMat);
  label.scale.set(2.6, 0.66, 1);
  label.position.set(0, 2.7, 0);
  group.add(label);

  return { group, label, target: group.position.clone() };
}

function updateAgents3D() {
  // Check if we need to create meshes for new agents
  agents.forEach((agent, idx) => {
    if (!agentMeshes.has(agent.id)) {
      const meshData = createAgentMesh(agent, idx);
      agentMeshes.set(agent.id, {
        ...meshData,
        phase: "idle",
        phaseTimer: 0
      });
    }
  });

  let workstationIndex = 0;
  agents.forEach((agent, idx) => {
    const item = agentMeshes.get(agent.id);
    if (!item) return;

    // Determine desk position (simple round robin based on current working agents count)
    // Note: In a real app, we'd assign a specific desk to a specific task/agent to avoid swapping.
    const deskPos = computers[workstationIndex % computers.length].clone();
    deskPos.y = 0.5;

    if (agent.status === "working") {
       workstationIndex++;

       if (item.phase === "idle") {
          // Start sequence: Go to board
          item.phase = "walking_to_board";
          item.target.set(0, 0.5, -3); // Near board
       } else if (item.phase === "walking_to_board") {
          if (item.group.position.distanceTo(item.target) < 0.5) {
             item.phase = "at_board";
             item.phaseTimer = 60; // Wait 60 frames (~1 sec)
          }
       } else if (item.phase === "at_board") {
          item.phaseTimer--;
          if (item.phaseTimer <= 0) {
             item.phase = "walking_to_desk";
             item.target.copy(deskPos);
          }
       } else if (item.phase === "walking_to_desk") {
          item.target.copy(deskPos);
          if (item.group.position.distanceTo(item.target) < 0.5) {
             item.phase = "working";
          }
       } else if (item.phase === "working") {
          item.target.copy(deskPos);
       }
    } else {
      // Return to spawn
      item.phase = "idle";
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

  if(typeof particles !== "undefined") particles.rotation.y += 0.0005;

  updateConfetti();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

// SSE Connection
const evtSource = new EventSource(`${API_URL}/api/events`);
evtSource.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    updateState(data);
  } catch(e) {
    console.error("Error parsing SSE data", e);
  }
};

tick();
