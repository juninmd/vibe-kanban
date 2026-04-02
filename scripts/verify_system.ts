import { Agent, Task, State } from '../src/types.js';

const API_URL = 'http://localhost:5174/api';

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface FetchOptions extends Omit<RequestInit, 'body'> {
    body?: string;
}

async function fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body ? options.body : undefined
        });
        const text = await res.text();
        return text ? JSON.parse(text) : {} as T;
    } catch (err: any) {
        // Suppress connection refused errors during startup
        if (err.cause?.code !== 'ECONNREFUSED' && err.code !== 'ECONNREFUSED') console.error(err);
        throw err;
    }
}

async function verifySystem() {
    console.log("Waiting for server...");
    let retries = 10;
    while (retries > 0) {
        try {
            await fetchJson(`${API_URL}/state`);
            console.log("Server is up!");
            break;
        } catch (err: unknown) {
            await wait(1000);
            retries--;
        }
    }

    if (retries === 0) {
        console.error("Server failed to start.");
        process.exit(1);
    }

    console.log("Verifying agents...");
    const state = await fetchJson<State>(`${API_URL}/state`);
    const agents = state.agents || [];

    // Check for specific roles
    const requiredRoles = [
        "Product Manager",
        "Segurança",
        "Performance",
        "Novas Funcionalidades",
        "Testes",
        "Novas Features"
    ];

    const missing = requiredRoles.filter((role: string) => !agents.find((a: Agent) => a.role === role));

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

    let taskRes: { task?: Task } | undefined;
    try {
        taskRes = await fetchJson<{ task: Task }>(`${API_URL}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
    } catch (err: unknown) {
        console.error("Failed to create task:", err);
        process.exit(1);
    }

    if (!taskRes || !taskRes.task) {
        console.error("Invalid task response:", taskRes);
        process.exit(1);
    }
    const createdTaskId = taskRes.task.id;
    console.log(`Task created: #${createdTaskId}`);

    // Wait for assignment
    console.log("Waiting for assignment...");
    let assigned = false;
    for (let i = 0; i < 15; i++) { // Wait up to 15s
        await wait(1000);
        try {
            const newState = await fetchJson<State>(`${API_URL}/state`);
            const task = newState.tasks.find((t: Task) => t.id === createdTaskId);
            if (task && (task.assignedTo || task.interrupted)) {
                console.log(`Task assigned to agent (or attempted and interrupted).`);
                assigned = true;
                break;
            }
        } catch (err: unknown) {
            console.error("Error polling state:", err);
        }
    }

    if (!assigned) {
        console.error("Task was not assigned within 15 seconds.");
        process.exit(1);
    }

    console.log("System verification successful!");
    process.exit(0);
}

verifySystem().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
