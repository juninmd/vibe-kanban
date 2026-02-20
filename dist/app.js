import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const API_URL = "";
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
let previousTasks = []; // To track changes
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
    settingsBtn: document.getElementById("settingsBtn"),
    settingsDialog: document.getElementById("settingsDialog"),
    settingsForm: document.getElementById("settingsForm"),
    cancelSettingsBtn: document.getElementById("cancelSettingsBtn"),
};
// Confetti State
const confettiParticles = [];
function updateState(data) {
    // Detect completions for celebration
    const newTasks = data.tasks || [];
    newTasks.forEach((t) => {
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
        if (!res.ok)
            return;
        const data = await res.json();
        updateState(data);
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
        // State update handled by SSE
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
        // Tailwind classes for column
        col.className = "bg-slate-800/40 backdrop-blur-md border border-white/10 rounded-xl p-4 grid gap-4 content-start min-w-[280px]";
        col.innerHTML = `<h3 class="text-sm font-bold text-slate-400 uppercase tracking-wider border-b border-slate-700 pb-2 mb-2">${laneLabels[lane]}</h3>`;
        tasks
            .filter((task) => task.lane === lane)
            .forEach((task) => {
            const card = document.createElement("article");
            // Tailwind classes for card
            const priorityColors = {
                alta: "border-l-red-500",
                media: "border-l-amber-500",
                baixa: "border-l-emerald-500"
            };
            const pColor = priorityColors[task.priority] || "border-l-slate-500";
            card.className = `border border-slate-700 rounded-lg bg-slate-800 p-3 grid gap-2 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all border-l-4 ${pColor}`;
            const assigned = task.assignedTo ? agents.find((a) => a.id === task.assignedTo)?.role : "-";
            // Logs preview
            const lastLog = task.logs && task.logs.length > 0 ? task.logs[task.logs.length - 1] : "";
            card.innerHTML = `
          <strong class="text-sm font-semibold text-slate-200 leading-snug">#${task.id} ${task.title}</strong>
          <div class="flex flex-wrap gap-2 text-[10px] text-slate-400 uppercase font-bold tracking-wide">
            <span class="bg-slate-700 rounded px-1.5 py-0.5 text-slate-300">${task.category}</span>
            <span class="bg-slate-700 rounded px-1.5 py-0.5 text-slate-300">${task.priority}</span>
            <span class="bg-slate-700 rounded px-1.5 py-0.5 text-slate-300">${task.source}</span>
            <span class="bg-slate-700 rounded px-1.5 py-0.5 text-indigo-300">${assigned}</span>
            ${task.interrupted ? '<span class="bg-red-900/50 text-red-300 rounded px-1.5 py-0.5">interrompido</span>' : ""}
          </div>
          ${lastLog ? `<div class="text-xs text-slate-500 font-mono mt-1 truncate border-t border-slate-700/50 pt-1">> ${lastLog}</div>` : ""}
        `;
            const actions = document.createElement("div");
            actions.className = "flex flex-wrap gap-1 mt-1";
            const makeBtn = (txt, onClick) => {
                const btn = document.createElement("button");
                btn.textContent = txt;
                btn.className = "text-[10px] px-2 py-1 bg-transparent border border-slate-600 rounded hover:bg-slate-700 hover:border-indigo-500 text-slate-300 transition-colors cursor-pointer";
                btn.onclick = onClick;
                return btn;
            };
            if (lane === "backlog")
                actions.append(makeBtn("Pegar", () => pickTask(task)));
            if (lane === "in_progress")
                actions.append(makeBtn("Parar", () => interruptTask(task)));
            actions.append(makeBtn("←", () => moveTask(task, -1)));
            actions.append(makeBtn("→", () => moveTask(task, +1)));
            actions.append(makeBtn("↑", () => reprioritize(task, -1)));
            actions.append(makeBtn("↓", () => reprioritize(task, +1)));
            actions.append(makeBtn("Bug", () => bugFromTask(task)));
            card.append(actions);
            col.append(card);
        });
        els.kanban.append(col);
    });
}
function renderAgents() {
    els.agentsList.innerHTML = agents
        .map((a) => `
      <div class="border border-slate-700 bg-slate-800 rounded-lg p-3 grid gap-1 text-sm shadow-sm hover:border-indigo-500/50 transition-colors">
        <strong class="text-indigo-400 font-semibold">${a.role}</strong>
        <div class="text-xs text-slate-400 grid gap-0.5">
           <span>Modelo: <span class="text-slate-300">${a.model}</span></span>
           <span>Categoria: <span class="text-slate-300">${a.category}</span></span>
           <span class="${a.status === 'working' ? 'text-emerald-400' : 'text-slate-500'} font-medium">
             ● ${a.status === "idle" ? "Livre" : "Trabalhando"}
           </span>
           ${a.assignedTask ? `<span class="text-indigo-300">Task: #${a.assignedTask}</span>` : ""}
        </div>
      </div>
    `)
        .join("");
}
function addEvent(text) {
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
    ].forEach(([title, source, category, priority]) => createTask({ title: title, source: source, category: category, priority: priority }));
});
els.resetDataBtn.addEventListener("click", () => {
    if (confirm("Tem certeza que deseja apagar todos os dados do servidor?")) {
        apiCall("/api/reset", "POST", {});
    }
});
els.settingsBtn?.addEventListener("click", () => {
    els.settingsDialog?.showModal();
});
els.cancelSettingsBtn?.addEventListener("click", () => {
    els.settingsDialog?.close();
});
els.settingsForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const formData = new FormData(els.settingsForm);
    const data = {};
    formData.forEach((value, key) => {
        if (value)
            data[key] = value;
    });
    if (Object.keys(data).length > 0) {
        await apiCall("/api/settings", "POST", data);
        alert("Configurações salvas!");
    }
    els.settingsDialog?.close();
});
// --- 3D Scene ---
const canvas = document.getElementById("sceneCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1022");
scene.fog = new THREE.FogExp2(0x0b1022, 0.02);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 8, 14);
camera.lookAt(0, 0, 0);
// Lighting
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x0f172a, 0.6);
scene.add(hemiLight);
const dir = new THREE.DirectionalLight("#a5b4fc", 0.8);
dir.position.set(5, 12, 5);
dir.castShadow = true;
dir.shadow.mapSize.width = 1024;
dir.shadow.mapSize.height = 1024;
scene.add(dir);
const accentLight1 = new THREE.PointLight("#6366f1", 1, 15);
accentLight1.position.set(-8, 5, -5);
scene.add(accentLight1);
const accentLight2 = new THREE.PointLight("#d946ef", 1, 15);
accentLight2.position.set(8, 5, -5);
scene.add(accentLight2);
// Room Environment
const roomGroup = new THREE.Group();
scene.add(roomGroup);
// Floor
const floorMat = new THREE.MeshStandardMaterial({ color: "#1e293b", roughness: 0.8, metalness: 0.2 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
roomGroup.add(floor);
// Grid (subtle)
const grid = new THREE.GridHelper(24, 24, 0x334155, 0x1e293b);
grid.position.y = 0.01;
grid.material.opacity = 0.2;
grid.material.transparent = true;
roomGroup.add(grid);
// Walls
const wallMat = new THREE.MeshStandardMaterial({ color: "#0f172a", roughness: 0.5 });
const backWall = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 0.5), wallMat);
backWall.position.set(0, 4, -8.25);
backWall.receiveShadow = true;
roomGroup.add(backWall);
// Server Racks (Decor)
function createServerRack(x) {
    const rack = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.8, 1), new THREE.MeshStandardMaterial({ color: "#000000", roughness: 0.3 }));
    box.position.y = 1.4;
    box.castShadow = true;
    rack.add(box);
    // Blinking lights
    const lightsGeo = new THREE.PlaneGeometry(1, 2.4);
    const lightsCanvas = document.createElement("canvas");
    lightsCanvas.width = 64;
    lightsCanvas.height = 128;
    const ctx = lightsCanvas.getContext("2d");
    // Draw initial random dots
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 40; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? "#22c55e" : "#3b82f6";
        ctx.fillRect(Math.random() * 60, Math.random() * 120, 2, 2);
    }
    const lightsTex = new THREE.CanvasTexture(lightsCanvas);
    lightsTex.magFilter = THREE.NearestFilter;
    const lights = new THREE.Mesh(lightsGeo, new THREE.MeshBasicMaterial({ map: lightsTex }));
    lights.position.set(0, 1.4, 0.51);
    rack.add(lights);
    rack.position.set(x, 0, -7);
    roomGroup.add(rack);
    return { canvas, ctx, tex: lightsTex };
}
const racks = [createServerRack(-10), createServerRack(-8), createServerRack(8), createServerRack(10)];
// Update racks animation
function updateRacks() {
    racks.forEach(r => {
        if (Math.random() > 0.1)
            return;
        const { ctx, tex } = r;
        ctx.fillStyle = "#000"; // dim
        ctx.fillStyle = Math.random() > 0.5 ? "#22c55e" : "#3b82f6";
        const x = Math.random() * 60;
        const y = Math.random() * 120;
        ctx.fillRect(x, y, 3, 3);
        // Clear some
        if (Math.random() > 0.5) {
            ctx.fillStyle = "#000";
            ctx.fillRect(Math.random() * 60, Math.random() * 120, 3, 3);
        }
        tex.needsUpdate = true;
    });
}
// Ambient Particles
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(600);
for (let i = 0; i < 600; i++)
    pPos[i] = (Math.random() - 0.5) * 20;
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
const kanbanMesh = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), new THREE.MeshStandardMaterial({ color: "#2a376f" }));
kanbanMesh.position.set(0, 2, -4.2);
// Add column separators
for (let i = -1; i <= 1; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(0.05, 3.8, 0.05), new THREE.MeshStandardMaterial({ color: "#5ea6ff" }));
    line.position.set(i * 2, 0, 0.11);
    kanbanMesh.add(line);
}
scene.add(kanbanMesh);
const kanbanGroup = new THREE.Group();
kanbanMesh.add(kanbanGroup);
function createTaskTexture(task) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    // Background
    const categoryColors = {
        roadmap: "#a855f7",
        seguranca: "#ef4444",
        performance: "#f97316",
        funcionalidades: "#3b82f6",
        testes: "#22c55e",
        features: "#06b6d4"
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
    if (title.length > 30)
        title = title.substring(0, 30) + "...";
    ctx.fillText(title, 32, 80);
    // Status/Meta
    ctx.font = "18px Inter, sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`${task.priority.toUpperCase()} • ${task.category}`, 32, 110);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
function updateKanban3D() {
    // Clear old meshes
    while (kanbanGroup.children.length > 0) {
        const child = kanbanGroup.children[0];
        if (child.geometry)
            child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material))
                child.material.forEach((m) => { if (m.map)
                    m.map.dispose(); m.dispose(); });
            else {
                if (child.material.map)
                    child.material.map.dispose();
                child.material.dispose();
            }
        }
        kanbanGroup.remove(child);
    }
    // Group tasks by lane to stack them
    const laneCounts = { backlog: 0, in_progress: 0, review: 0, done: 0 };
    const laneX = { backlog: -3, in_progress: -1, review: 1, done: 3 };
    tasks.forEach(task => {
        const lane = task.lane || "backlog";
        if (lane === "done" && (laneCounts.done || 0) > 5)
            return;
        const count = laneCounts[lane] || 0;
        const x = laneX[lane] || 0;
        const y = 1.3 - count * 0.6;
        if (y < -1.5)
            return; // Don't overflow board
        // Create card mesh
        const geometry = new THREE.BoxGeometry(1.8, 0.5, 0.05);
        const texture = createTaskTexture(task);
        const material = new THREE.MeshStandardMaterial({
            map: texture,
            emissive: 0x222222,
            emissiveMap: texture,
            emissiveIntensity: 0.4
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, y, 0.15);
        kanbanGroup.add(mesh);
        laneCounts[lane] = count + 1;
    });
}
const computers = [];
const screenGlows = [];
const computerScreens = [];
for (let i = 0; i < 4; i++) {
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 1.2), new THREE.MeshStandardMaterial({ color: "#202b56" }));
    desk.position.set(-6 + i * 4, 0.3, 2.8);
    scene.add(desk);
    computers.push(desk.position.clone());
    // Screen Canvas
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 512, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
    screen.position.set(-6 + i * 4, 0.9, 2.8);
    screen.rotation.x = -0.2;
    scene.add(screen);
    screenGlows.push(screen);
    computerScreens.push({ canvas, ctx, texture, mesh: screen });
}
function updateScreenContent(index, text) {
    const screen = computerScreens[index];
    if (!screen)
        return;
    const { ctx, texture, canvas } = screen;
    // Background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Header
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, 0, canvas.width, 40);
    ctx.fillStyle = "#64748b";
    ctx.font = "bold 20px Inter, monospace";
    ctx.fillText("TERMINAL", 10, 28);
    // Text content (multiline)
    ctx.fillStyle = "#22c55e";
    ctx.font = "18px monospace";
    const lines = text.split("\n");
    const visibleLines = lines.slice(Math.max(lines.length - 8, 0));
    visibleLines.forEach((line, i) => {
        ctx.fillText(line.substring(0, 50), 10, 70 + i * 24);
    });
    texture.needsUpdate = true;
}
const agentMeshes = new Map();
function createSkinTexture(color, text) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    // Background
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Text on "chest" area
    ctx.font = "bold 60px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // Draw text in the middle (should map to front/back of capsule)
    // We might need to adjust based on UVs, but center is a safe bet for visibility
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
function createAgentMesh(agent, index) {
    const group = new THREE.Group();
    const roleColors = {
        "Product Manager": "#a855f7",
        "Segurança": "#ef4444",
        "Performance": "#f97316",
        "Novas Funcionalidades": "#3b82f6",
        "Testes": "#22c55e",
        "Novas Features": "#06b6d4"
    };
    const colorHex = roleColors[agent.role] || "#888888";
    const color = new THREE.Color(colorHex);
    if (agent.role === "Product Manager") {
        // Steve Jobs Persona
        // Head
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), new THREE.MeshStandardMaterial({ color: "#ffdbac" }));
        head.position.y = 1.7;
        group.add(head);
        // Glasses
        const glassesMat = new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.2 });
        const leftLens = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 24), glassesMat);
        leftLens.position.set(-0.12, 1.72, 0.26);
        group.add(leftLens);
        const rightLens = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.01, 8, 24), glassesMat);
        rightLens.position.set(0.12, 1.72, 0.26);
        group.add(rightLens);
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 8), glassesMat);
        bridge.rotation.z = Math.PI / 2;
        bridge.position.set(0, 1.72, 0.26);
        group.add(bridge);
        // Turtleneck Body
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.8, 32), new THREE.MeshStandardMaterial({ color: "#111111" }));
        body.position.y = 1.1;
        group.add(body);
        // Arms
        const armGeo = new THREE.CapsuleGeometry(0.08, 0.6, 4, 8);
        const armMat = new THREE.MeshStandardMaterial({ color: "#111111" }); // Black sleeves
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.45, 1.3, 0);
        leftArm.rotation.z = -0.2;
        group.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.45, 1.3, 0);
        rightArm.rotation.z = 0.2;
        group.add(rightArm);
        // Jeans Legs
        const legGeo = new THREE.CylinderGeometry(0.11, 0.1, 0.8, 16);
        const legMat = new THREE.MeshStandardMaterial({ color: "#3b82f6" }); // Blue jeans
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.set(-0.15, 0.4, 0);
        group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.set(0.15, 0.4, 0);
        group.add(rightLeg);
        // Shoes
        const shoeGeo = new THREE.BoxGeometry(0.15, 0.1, 0.3);
        const shoeMat = new THREE.MeshStandardMaterial({ color: "#9ca3af" }); // New Balance grey
        const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
        leftShoe.position.set(-0.15, 0.05, 0.1);
        group.add(leftShoe);
        const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
        rightShoe.position.set(0.15, 0.05, 0.1);
        group.add(rightShoe);
        group.userData.legs = [leftLeg, rightLeg];
        group.userData.arms = [leftArm, rightArm];
    }
    else {
        // Standard Agent (Robot/Armor)
        const skinTex = createSkinTexture(colorHex, agent.model);
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.8, 4, 16), new THREE.MeshStandardMaterial({
            map: skinTex,
            color: 0xffffff,
            emissive: color,
            emissiveIntensity: 0.15
        }));
        body.rotation.y = -Math.PI / 2;
        body.position.y = 1.1;
        group.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 16), new THREE.MeshStandardMaterial({ color: "#dce6ff" }));
        head.position.y = 1.9;
        group.add(head);
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.1, 0.15), new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.2 }));
        visor.position.set(0, 1.92, 0.22);
        group.add(visor);
        const badgeColor = new THREE.Color(colorHex);
        const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 16), new THREE.MeshStandardMaterial({
            color: badgeColor,
            emissive: badgeColor,
            emissiveIntensity: 0.8
        }));
        badge.rotation.x = Math.PI / 2;
        badge.position.set(0, 1.45, 0.32);
        group.add(badge);
        const armGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
        const armMat = new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 0.1 });
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-0.5, 1.3, 0);
        leftArm.rotation.z = -0.2;
        group.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(0.5, 1.3, 0);
        rightArm.rotation.z = 0.2;
        group.add(rightArm);
        // Legs
        const legGeo = new THREE.CapsuleGeometry(0.12, 0.7, 4, 8);
        const legMat = new THREE.MeshStandardMaterial({ color: "#334155" });
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.set(-0.18, 0.4, 0);
        group.add(leftLeg);
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.set(0.18, 0.4, 0);
        group.add(rightLeg);
        // Accessories
        if (agent.role === "Performance") {
            // Headphones
            const band = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 24, 2.5), new THREE.MeshStandardMaterial({ color: "#111" }));
            band.rotation.z = -1.25;
            band.position.set(0, 1.95, 0);
            group.add(band);
            const earL = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16), new THREE.MeshStandardMaterial({ color: "#111" }));
            earL.rotation.z = Math.PI / 2;
            earL.position.set(-0.3, 1.9, 0);
            group.add(earL);
            const earR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 16), new THREE.MeshStandardMaterial({ color: "#111" }));
            earR.rotation.z = Math.PI / 2;
            earR.position.set(0.3, 1.9, 0);
            group.add(earR);
        }
        else if (agent.role === "Segurança") {
            // Police Cap
            const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.15, 32), new THREE.MeshStandardMaterial({ color: "#1e293b" }));
            capTop.position.set(0, 2.15, 0);
            group.add(capTop);
            const capBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 32, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: "#000" }));
            capBrim.rotation.x = 0.2;
            capBrim.position.set(0, 2.1, 0.15);
            group.add(capBrim);
        }
        else if (agent.role === "Testes") {
            // Clipboard on left arm
            const board = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.02), new THREE.MeshStandardMaterial({ color: "#a855f7" }));
            board.position.set(0.2, -0.1, 0.2);
            board.rotation.x = -0.5;
            leftArm.add(board);
        }
        group.userData.legs = [leftLeg, rightLeg];
        group.userData.arms = [leftArm, rightArm];
    }
    group.position.set(-5 + index * 2, 0, -0.5);
    scene.add(group);
    function makeLabelCanvas(text) {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = 80;
        const ctx = canvas.getContext("2d");
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
    labelTex.colorSpace = THREE.SRGBColorSpace;
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
    // Reset glows
    screenGlows.forEach(s => {
        if (s.material.opacity)
            s.material.opacity = 0.05;
    });
    let workstationIndex = 0;
    agents.forEach((agent, idx) => {
        const item = agentMeshes.get(agent.id);
        if (!item)
            return;
        const spawnPos = new THREE.Vector3(-5 + idx * 2, 0, -0.5);
        // Determine desk position. We need a stable mapping if possible, but strictly round-robin by list index works for visual chaos
        // A better way is to hash the agent ID to a desk, but let's keep it simple.
        const deskIdx = (idx) % computers.length;
        const deskPos = computers[deskIdx].clone();
        deskPos.y = 0.5;
        // Walking Animation
        const isMoving = item.phase.startsWith("walking_");
        if (isMoving) {
            const [leftLeg, rightLeg] = item.group.userData.legs || [];
            const [leftArm, rightArm] = item.group.userData.arms || [];
            const speed = 0.015;
            if (leftLeg && rightLeg) {
                leftLeg.rotation.x = Math.sin(Date.now() * speed) * 0.5;
                rightLeg.rotation.x = Math.cos(Date.now() * speed) * 0.5;
            }
            if (leftArm && rightArm) {
                leftArm.rotation.x = -Math.sin(Date.now() * speed) * 0.5;
                rightArm.rotation.x = -Math.cos(Date.now() * speed) * 0.5;
            }
        }
        else if (item.phase === "idle" || item.phase === "at_board") {
            // Reset limbs
            const [leftLeg, rightLeg] = item.group.userData.legs || [];
            const [leftArm, rightArm] = item.group.userData.arms || [];
            if (leftLeg)
                leftLeg.rotation.x = 0;
            if (rightLeg)
                rightLeg.rotation.x = 0;
            if (leftArm)
                leftArm.rotation.x = 0;
            if (rightArm)
                rightArm.rotation.x = 0;
        }
        if (agent.status === "working") {
            if (item.phase === "idle" || item.phase === "walking_from_desk") {
                item.phase = "walking_to_board";
                item.target.set(0, 0.5, -3); // Board position
            }
            else if (item.phase === "walking_to_board") {
                if (item.group.position.distanceTo(item.target) < 0.8) {
                    item.phase = "at_board";
                    item.phaseTimer = 60;
                }
            }
            else if (item.phase === "at_board") {
                item.phaseTimer--;
                if (item.phaseTimer <= 0) {
                    item.phase = "walking_to_desk";
                    item.target.copy(deskPos);
                }
            }
            else if (item.phase === "walking_to_desk") {
                item.target.copy(deskPos);
                if (item.group.position.distanceTo(item.target) < 0.5) {
                    item.phase = "working";
                }
            }
            else if (item.phase === "working") {
                item.target.copy(deskPos);
                // Highlight screen
                // if (screenGlows[deskIdx]) (screenGlows[deskIdx].material as any).opacity = 0.5 + Math.random() * 0.2;
                if (agent.assignedTask) {
                    const task = tasks.find(t => t.id === agent.assignedTask);
                    if (task) {
                        const logText = (task.logs && task.logs.length > 0) ? task.logs.join("\n") : `Working on #${task.id}...`;
                        updateScreenContent(deskIdx, logText);
                    }
                }
                // Typing animation (arms)
                const [leftArm, rightArm] = item.group.userData.arms || [];
                if (leftArm && rightArm) {
                    leftArm.rotation.x = Math.sin(Date.now() * 0.01) * 0.2;
                    rightArm.rotation.x = Math.cos(Date.now() * 0.01) * 0.2;
                }
            }
        }
        else {
            // If was working, walk back. If already idle, stay idle.
            if (item.phase === "working" || item.phase === "walking_to_desk") {
                item.phase = "walking_from_desk";
                item.target.copy(spawnPos);
            }
            else if (item.phase === "walking_from_desk") {
                item.target.copy(spawnPos);
                if (item.group.position.distanceTo(item.target) < 0.5) {
                    item.phase = "idle";
                    // Reset arms
                    const [leftArm, rightArm] = item.group.userData.arms || [];
                    if (leftArm)
                        leftArm.rotation.x = 0;
                    if (rightArm)
                        rightArm.rotation.x = 0;
                }
            }
            else {
                item.phase = "idle";
                item.target.copy(spawnPos);
            }
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
    if (typeof particles !== "undefined")
        particles.rotation.y += 0.0005;
    updateRacks();
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
    }
    catch (e) {
        console.error("Error parsing SSE data", e);
    }
};
tick();
