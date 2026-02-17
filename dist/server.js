import { createServer } from "http";
import * as fs from "fs";
import * as path from "path";
import { MockDriver } from "./drivers/MockDriver.js";
import { GeminiDriver } from "./drivers/GeminiDriver.js";
import { CopilotDriver } from "./drivers/CopilotDriver.js";
import { OpenCodeDriver } from "./drivers/OpenCodeDriver.js";
const PORT = process.env.PORT ? Number(process.env.PORT) : 5174;
// --- State ---
let taskIdCounter = 1;
const state = {
    tasks: [],
    agents: [
        { id: "pm", role: "Roadmap", model: "gpt-4.1", category: "roadmap", status: "idle", assignedTask: null },
        { id: "sec", role: "Segurança", model: "o3-mini", category: "seguranca", status: "idle", assignedTask: null },
        { id: "perf", role: "Performance", model: "gpt-4o", category: "performance", status: "idle", assignedTask: null },
        { id: "func", role: "Funcionalidades", model: "gpt-4.1-mini", category: "funcionalidades", status: "idle", assignedTask: null },
        { id: "tests", role: "Testes", model: "o1", category: "testes", status: "idle", assignedTask: null },
        { id: "feat", role: "Features", model: "codex-mini", category: "features", status: "idle", assignedTask: null },
    ],
    events: []
};
// Driver selection
const drivers = {
    mock: new MockDriver(),
    gemini: new GeminiDriver(),
    copilot: new CopilotDriver(),
    opencode: new OpenCodeDriver(),
};
let currentDriver = drivers.mock;
function addEvent(text) {
    state.events.unshift({ timestamp: new Date().toLocaleTimeString("pt-BR"), text });
    if (state.events.length > 50)
        state.events.pop();
}
function getTask(id) { return state.tasks.find(t => t.id === id); }
function getAgent(id) { return state.agents.find(a => a.id === id); }
// --- Helpers ---
function jsonResponse(res, status, body) {
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS,DELETE",
        "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end(JSON.stringify(body));
}
function parseBody(req) {
    return new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk) => (data += chunk));
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : {});
            }
            catch (e) {
                resolve({});
            }
        });
    });
}
// --- Server ---
const server = createServer(async (req, res) => {
    const { method, url } = req;
    if (!url)
        return;
    // Serve static files
    if (method === "GET" && !url.startsWith("/api")) {
        let filePath = "." + url;
        if (filePath === "./")
            filePath = "./index.html";
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
        }
        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code == "ENOENT") {
                    jsonResponse(res, 404, { error: "Not found" });
                }
                else {
                    res.writeHead(500);
                    res.end("Sorry, check with the site admin for error: " + error.code + " ..\n");
                }
            }
            else {
                res.writeHead(200, { "Content-Type": contentType });
                res.end(content, "utf-8");
            }
        });
        return;
    }
    if (method === "OPTIONS")
        return jsonResponse(res, 200, { ok: true });
    // GET /api/state
    if (url === "/api/state" && method === "GET") {
        return jsonResponse(res, 200, state);
    }
    // POST /api/tasks (Create task)
    if (url === "/api/tasks" && method === "POST") {
        const body = await parseBody(req);
        const task = {
            id: taskIdCounter++,
            title: body.title,
            source: body.source || "user",
            category: body.category || "misc",
            priority: body.priority || "media",
            lane: "backlog",
            assignedTo: null,
            interrupted: false,
            logs: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        state.tasks.push(task);
        addEvent(`Novo card criado: ${task.title} (${task.source})`);
        return jsonResponse(res, 201, { task });
    }
    // POST /api/assign (Assign task to agent)
    if (url === "/api/assign" && method === "POST") {
        const body = await parseBody(req);
        const { taskId, agentId } = body;
        const task = getTask(taskId);
        const agent = agentId ? getAgent(agentId) : state.agents.find(a => a.category === task?.category && a.status === "idle");
        if (!task)
            return jsonResponse(res, 404, { error: "Task not found" });
        if (!agent)
            return jsonResponse(res, 404, { error: "No available agent" });
        // Update state
        task.assignedTo = agent.id;
        task.lane = "in_progress";
        task.interrupted = false;
        agent.status = "working";
        agent.assignedTask = task.id;
        addEvent(`${agent.role} iniciou a tarefa #${task.id}`);
        // Execute via Driver
        currentDriver.executeTask(task, agent, {
            onLog: (tid, msg) => {
                const t = getTask(tid);
                if (t) {
                    t.logs.push(msg);
                    // Only log important steps to global event log to avoid spam
                    if (msg.includes("Error") || msg.includes("Completed"))
                        addEvent(`#${tid}: ${msg}`);
                }
            },
            onComplete: (tid) => {
                const t = getTask(tid);
                if (t && t.assignedTo) {
                    const a = getAgent(t.assignedTo);
                    if (a) {
                        a.status = "idle";
                        a.assignedTask = null;
                    }
                    t.assignedTo = null;
                    t.lane = "done"; // simplified workflow
                    addEvent(`Tarefa #${tid} concluída!`);
                }
            },
            onBugFound: (tid, desc) => {
                const t = getTask(tid);
                if (t) {
                    addEvent(`BUG encontrado em #${tid}: ${desc}`);
                    // Create bug task
                    const bugTask = {
                        id: taskIdCounter++,
                        title: `Bug: ${desc}`,
                        source: "system",
                        category: "testes",
                        priority: "alta",
                        lane: "backlog",
                        assignedTo: null,
                        interrupted: false,
                        logs: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    state.tasks.push(bugTask);
                    // For now, interrupt original task
                    if (t.assignedTo) {
                        const a = getAgent(t.assignedTo);
                        if (a) {
                            a.status = "idle";
                            a.assignedTask = null;
                        }
                        t.assignedTo = null;
                        t.lane = "backlog"; // Return to backlog to retry later
                        t.interrupted = true;
                    }
                }
            },
            onInterrupt: (tid) => {
                // Handled by interrupt endpoint logic mainly
            }
        });
        return jsonResponse(res, 200, { task, agent });
    }
    // POST /api/interrupt
    if (url === "/api/interrupt" && method === "POST") {
        const { taskId } = await parseBody(req);
        const task = getTask(taskId);
        if (!task)
            return jsonResponse(res, 404, { error: "Task not found" });
        if (task.assignedTo) {
            const agent = getAgent(task.assignedTo);
            if (agent) {
                agent.status = "idle";
                agent.assignedTask = null;
            }
            // Stop driver
            currentDriver.interruptTask(task);
            task.assignedTo = null;
            task.lane = "backlog";
            task.interrupted = true;
            addEvent(`Tarefa #${taskId} interrompida.`);
        }
        return jsonResponse(res, 200, { task });
    }
    // POST /api/move
    if (url === "/api/move" && method === "POST") {
        const { taskId, lane } = await parseBody(req);
        const task = getTask(taskId);
        if (!task)
            return jsonResponse(res, 404, { error: "Task not found" });
        // If moving out of in_progress, interrupt/finish logic
        if (task.lane === "in_progress" && lane !== "in_progress") {
            if (task.assignedTo) {
                const agent = getAgent(task.assignedTo);
                if (agent) {
                    agent.status = "idle";
                    agent.assignedTask = null;
                }
                currentDriver.interruptTask(task);
                task.assignedTo = null;
            }
        }
        task.lane = lane;
        return jsonResponse(res, 200, { task });
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
    // Reset
    if (url === "/api/reset" && method === "POST") {
        state.tasks = [];
        state.events = [];
        state.agents.forEach(a => { a.status = "idle"; a.assignedTask = null; });
        taskIdCounter = 1;
        addEvent("Sistema resetado.");
        return jsonResponse(res, 200, { ok: true });
    }
    jsonResponse(res, 404, { error: "Not found" });
});
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
