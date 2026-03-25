import type { Agent, Task, State } from '../src/types.js';
import { setTimeout } from 'timers/promises';

const API_URL = 'http://localhost:5174/api';

async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
    try {
        const res = await fetch(url, options);
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    } catch (err: any) {
        // Suppress connection refused errors during startup
        if (err.cause?.code !== 'ECONNREFUSED' && err.code !== 'ECONNREFUSED') {
             console.error(err);
        }
        throw err;
    }
}

async function verifySystem() {
    console.log("Waiting for server...");
    let serverUp = false;
    for (let attempts = 0; attempts < 30; attempts++) {
        try {
            const res = await fetch(`${API_URL}/state`);
            if (res.ok) {
                serverUp = true;
                break;
            }
        } catch {
            // retry
        }
        await setTimeout(300);
    }

    if (!serverUp) {
        console.error("Server failed to start.");
        process.exit(1);
    }
    console.log("Server is up!");

    console.log("Verifying agents...");
    const state = await fetchJson<State>(`${API_URL}/state`);
    const agents: Agent[] = state.agents || [];

    // Check for specific roles
    const requiredRoles = [
        "Product Manager",
        "Segurança",
        "Performance",
        "Novas Funcionalidades",
        "Testes",
        "Novas Features"
    ];

    const missing = requiredRoles.filter(role => !agents.find((a: Agent) => a.role === role));

    if (missing.length > 0) {
        console.error("Missing required agents:", missing);
        process.exit(1);
    }
    console.log("All required agents present.");

    // Create a task
    console.log("Creating verification task...");
    const taskData = {
        title: "Verification Task",
        source: "user",
        category: "feature",
        priority: "media"
    };

    let taskRes: { task: Task };
    try {
        taskRes = await fetchJson<{ task: Task }>(`${API_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
    } catch (e) {
        console.error("Failed to create task:", e);
        process.exit(1);
    }

    if (!taskRes || !taskRes.task) {
        console.error("Invalid task response:", taskRes);
        process.exit(1);
    }
    console.log(`Task created: #${taskRes.task.id}`);

    // Wait for assignment
    console.log("Waiting for assignment...");
    let assigned = false;
    for (let i = 0; i < 15; i++) { // Wait up to 15s
        await setTimeout(1000);
        try {
            const newState = await fetchJson<State>(`${API_URL}/state`);
            const task = newState.tasks.find((t: Task) => t.id === taskRes.task.id);
            if (task && (task.assignedTo || task.interrupted)) {
                console.log(`Task assigned to agent (or attempted and interrupted).`);
                assigned = true;
                break;
            }
        } catch (e) {
            console.error("Error polling state:", e);
        }
    }

    if (!assigned) {
        console.error("Task was not assigned within 15 seconds.");
        process.exit(1);
    }

    console.log("System verification successful!");
    process.exit(0);
}

verifySystem();
