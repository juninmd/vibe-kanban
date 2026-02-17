// @ts-nocheck
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const API_URL = "http://localhost:5174";
const lanes = ["backlog", "in_progress", "review", "done"];
const laneLabels = {
    backlog: "Backlog",
    in_progress: "Em progresso",
    review: "Review",
    done: "Concluído",
};
let agents = [];
let tasks = [];
let eventLog = [];
const els = {
    form: document.getElementById("taskForm"),
    source: document.getElementById("taskSource"),
    title: document.getElementById("taskTitle"),
    category: document.getElementById("taskCategory"),
    priority: document.getElementById("taskPriority"),
    driverSelect: document.getElementById("driverSelect"),
    kanban: document.getElementById("kanbanBoard"),
    agentsList: document.getElementById("agentsList"),
    eventLog: document.getElementById("eventLog"),
    view3d: document.getElementById("view3d"),
    view2d: document.getElementById("view2d"),
    toggleViewBtn: document.getElementById("toggleViewBtn"),
    seedTasksBtn: document.getElementById("seedTasksBtn"),
    resetDataBtn: document.getElementById("resetDataBtn"),
};
async function fetchState() {
    try {
        const res = await fetch(`${API_URL}/api/state`);
        if (!res.ok)
            return;
        const data = await res.json();
        tasks = data.tasks || [];
        agents = data.agents || [];
        eventLog = data.events || [];
        render();
    }
    catch (e) {
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
        // Immediately fetch state to update UI
        await fetchState();
        return await res.json();
    }
    catch (e) {
        console.error(`API call failed ${endpoint}:`, e);
    }
}
function createTask({ title, source, category, priority }) {
    apiCall("/api/tasks", "POST", { title, source, category, priority });
}
function pickTask(task) {
    apiCall("/api/assign", "POST", { taskId: task.id, category: task.category });
}
function interruptTask(task) {
    apiCall("/api/interrupt", "POST", { taskId: task.id });
}
function moveTask(task, dir) {
    const idx = lanes.indexOf(task.lane);
    const next = idx + dir;
    if (next < 0 || next >= lanes.length)
        return;
    apiCall("/api/move", "POST", { taskId: task.id, lane: lanes[next] });
}
function reprioritize(task, direction) {
    apiCall("/api/reorder", "POST", { taskId: task.id, direction });
}
function bugFromTask(task) {
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
            const makeBtn = (txt, onClick) => {
                const btn = document.createElement("button");
                btn.textContent = txt;
                btn.onclick = onClick;
                return btn;
            };
            if (lane === "backlog")
                actions.append(makeBtn("Pegar tarefa", () => pickTask(task)));
            if (lane === "in_progress")
                actions.append(makeBtn("Interromper", () => interruptTask(task)));
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
function addEvent(text) {
    eventLog.unshift({ timestamp: new Date().toLocaleTimeString(), text });
    renderEvents();
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
els.driverSelect?.addEventListener("change", async () => { const driver = els.driverSelect.value; await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driver }) }); addEvent("Driver alterado: " + driver); renderEvents(); });
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
    ].forEach(([title, source, category, priority]) => createTask({ title: title, source: source, category: category, priority: priority }));
});
els.resetDataBtn.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja apagar todos os dados do servidor?")) {
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
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), new THREE.MeshStandardMaterial({ color: "#141c3f" }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const grid = new THREE.GridHelper(24, 24, 0x30385f, 0x1b2241);
grid.position.y = 0.01;
scene.add(grid);
// Particles
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(600);
for (let i = 0; i < 600; i++)
    pPos[i] = (Math.random() - 0.5) * 20;
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
const pMat = new THREE.PointsMaterial({ color: 0x88ccff, size: 0.05, transparent: true, opacity: 0.4 });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
const kanbanMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), new THREE.MeshStandardMaterial({ color: "#2a376f" }));
kanbanMesh.position.set(0, 2, -4.2);
scene.add(kanbanMesh);
const computers = [];
for (let i = 0; i < 4; i++) {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: "#202b56" }));
    desk.position.set(-6 + i * 4, 0.3, 2.8);
    scene.add(desk);
    computers.push(desk.position.clone());
}
const agentMeshes = new Map();
function createAgentMesh(agent, index) {
    const group = new THREE.Group();
    const hue = (index * 0.15) % 1;
    const color = new THREE.Color().setHSL(hue, 0.7, 0.6);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
    body.position.y = 1;
    group.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), new THREE.MeshStandardMaterial({ color: "#dce6ff" }));
    head.position.y = 1.9;
    group.add(head);
    group.position.set(-5 + index * 2, 0, -0.5);
    scene.add(group);
    function makeLabelCanvas(text) {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "rgba(20,24,38,0.9)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.font = "28px Inter, sans-serif";
        ctx.fillStyle = "#e6e9ff";
        ctx.textAlign = "center";
        ctx.fillText(text, canvas.width / 2, 42);
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
            agentMeshes.set(agent.id, createAgentMesh(agent, idx));
        }
    });
    let workstationIndex = 0;
    agents.forEach((agent, idx) => {
        const item = agentMeshes.get(agent.id);
        if (!item)
            return;
        if (agent.status === "working") {
            const wp = computers[workstationIndex % computers.length].clone();
            item.target.copy(wp);
            item.target.y = 0.5;
            workstationIndex += 1;
        }
        else {
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
    particles.rotation.y += 0.0005;
    controls.update();
    if (typeof particles !== "undefined")
        particles.rotation.y += 0.0005;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
// Initial fetch and polling
fetchState();
setInterval(fetchState, 1000);
tick();
