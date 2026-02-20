import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createOffice } from "./office.js";
import { getHeadMaterials, getBodyMaterials, getLimbMaterial } from "./skins.js";
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
// --- 3D Scene ---
const canvas = document.getElementById("sceneCanvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#0b1022");
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
camera.position.set(0, 7, 12);
camera.lookAt(0, 0, 0);
const ambientLight = new THREE.AmbientLight("#ffffff", 0.75);
scene.add(ambientLight);
const dir = new THREE.DirectionalLight("#b7c6ff", 1.2);
dir.position.set(5, 8, 3);
scene.add(dir);
function updateLighting() {
    const workingCount = agents.filter(a => a.status === "working").length;
    // Target intensity: brighter when busy
    const targetDir = workingCount > 0 ? 1.8 : 0.8;
    const targetAmb = workingCount > 0 ? 0.9 : 0.4;
    dir.intensity += (targetDir - dir.intensity) * 0.05;
    ambientLight.intensity += (targetAmb - ambientLight.intensity) * 0.05;
}
const officeData = createOffice(scene);
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
        mesh.userData = { taskId: task.id };
        kanbanGroup.add(mesh);
        laneCounts[lane] = count + 1;
    });
}
const computers = officeData.deskPositions;
const screenGlows = officeData.screenGlows;
const agentMeshes = new Map();
function createAgentMesh(agent, index) {
    const group = new THREE.Group();
    const roleKeyMap = {
        "Product Manager": "product_manager",
        "Segurança": "seguranca",
        "Performance": "performance",
        "Novas Funcionalidades": "funcionalidades",
        "Testes": "testes",
        "Novas Features": "features"
    };
    const roleKey = roleKeyMap[agent.role] || "features";
    // Use existing color map for trails/lights
    const roleColors = {
        "Product Manager": "#a855f7",
        "Segurança": "#ef4444",
        "Performance": "#f97316",
        "Novas Funcionalidades": "#3b82f6",
        "Testes": "#22c55e",
        "Novas Features": "#06b6d4"
    };
    const color = new THREE.Color(roleColors[agent.role] || "#888888");
    // Voxel Construction
    const headMat = getHeadMaterials(roleKey);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), headMat);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);
    const bodyMat = getBodyMaterials(roleKey);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat);
    body.position.y = 1.15;
    body.castShadow = true;
    group.add(body);
    const limbMat = getLimbMaterial(roleKey);
    const armGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
    armGeo.translate(0, -0.25, 0); // Pivot at shoulder
    const leftArm = new THREE.Mesh(armGeo, limbMat);
    leftArm.position.set(-0.35, 1.4, 0);
    leftArm.castShadow = true;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, limbMat);
    rightArm.position.set(0.35, 1.4, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
    const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    legGeo.translate(0, -0.35, 0); // Pivot at hip
    const leftLeg = new THREE.Mesh(legGeo, limbMat);
    leftLeg.position.set(-0.15, 0.7, 0);
    leftLeg.castShadow = true;
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, limbMat);
    rightLeg.position.set(0.15, 0.7, 0);
    rightLeg.castShadow = true;
    group.add(rightLeg);
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
    label.scale.set(1.5, 0.4, 1);
    label.position.set(0, 2.3, 0);
    group.add(label);
    return { group, label, target: group.position.clone(), color };
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
    agents.forEach((agent, idx) => {
        const item = agentMeshes.get(agent.id);
        if (!item)
            return;
        const spawnPos = new THREE.Vector3(-5 + idx * 2, 0, -0.5);
        const deskIdx = (idx) % computers.length;
        // Safe check for computers array
        const deskPos = computers[deskIdx] ? computers[deskIdx].clone() : spawnPos.clone();
        deskPos.y = 0.5;
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
                if (screenGlows[deskIdx])
                    screenGlows[deskIdx].material.opacity = 0.5 + Math.random() * 0.2;
                // Typing animation (arms)
                // New Indices: LeftArm(2), RightArm(3)
                const leftArm = item.group.children[2];
                const rightArm = item.group.children[3];
                if (leftArm && rightArm) {
                    leftArm.rotation.x = -Math.PI / 2 + Math.sin(Date.now() * 0.015) * 0.2; // Arms up for typing
                    rightArm.rotation.x = -Math.PI / 2 + Math.cos(Date.now() * 0.015) * 0.2;
                }
                // Legs sitting
                const leftLeg = item.group.children[4];
                const rightLeg = item.group.children[5];
                if (leftLeg && rightLeg) {
                    leftLeg.rotation.x = -Math.PI / 2;
                    rightLeg.rotation.x = -Math.PI / 2;
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
                    [2, 3, 4, 5].forEach(i => { if (item.group.children[i])
                        item.group.children[i].rotation.x = 0; });
                }
            }
            else {
                item.phase = "idle";
                item.target.copy(spawnPos);
                [2, 3, 4, 5].forEach(i => { if (item.group.children[i])
                    item.group.children[i].rotation.x = 0; });
            }
        }
        // Walking Animation
        if (item.phase.includes("walking")) {
            const time = Date.now() * 0.015;
            const leftArm = item.group.children[2];
            const rightArm = item.group.children[3];
            const leftLeg = item.group.children[4];
            const rightLeg = item.group.children[5];
            if (leftLeg && rightLeg) {
                leftLeg.rotation.x = Math.sin(time) * 0.5;
                rightLeg.rotation.x = Math.cos(time) * 0.5;
            }
            if (leftArm && rightArm) {
                leftArm.rotation.x = Math.cos(time) * 0.5;
                rightArm.rotation.x = Math.sin(time) * 0.5;
            }
        }
        // Rotate to face target
        if (item.phase !== "working" && item.phase !== "idle") {
            item.group.lookAt(item.target.x, item.group.position.y, item.target.z);
        }
        else if (item.phase === "working") {
            // Face towards board (away from desk screen usually, or towards it?)
            // Desk setup: Screen at Z-0.3 relative to desk.
            // If desk is at Z=2.8, screen is at Z=2.5.
            // Agent is at Z=2.8.
            // Agent should face -Z to see screen.
            item.group.lookAt(item.group.position.x, item.group.position.y, -100);
        }
        else {
            item.group.rotation.set(0, 0, 0);
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
        // Spawn trail if moving
        if (item.phase !== "idle" && item.phase !== "working" && item.phase !== "at_board") {
            if (Math.random() < 0.4) {
                spawnTrail(item.group.position, item.color);
            }
        }
    });
    if (typeof particles !== "undefined")
        particles.rotation.y += 0.0005;
    updateConfetti();
    updateTrails();
    updateLighting();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
}
const trailParticles = [];
const trailGeo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
function spawnTrail(position, color) {
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
            p.mesh.material.dispose();
            trailParticles.splice(i, 1);
        }
    }
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
// --- Interaction ---
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
function onPointerDown(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(kanbanGroup.children);
    if (intersects.length > 0) {
        const object = intersects[0].object;
        const taskId = object.userData.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            alert(`Task #${task.id}\nTitle: ${task.title}\nCategory: ${task.category}\nAssigned: ${task.assignedTo || "None"}`);
        }
    }
}
window.addEventListener('pointerdown', onPointerDown);
tick();
