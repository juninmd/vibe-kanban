const API_URL = 'http://localhost:5174/api';

function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

interface FetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}

async function fetchJson(url: string, options: FetchOptions = {}) {
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body
        });
        const text = await res.text();
        return text ? JSON.parse(text) : {};
    } catch (err: any) {
        if (err.cause?.code !== 'ECONNREFUSED') console.error(err);
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
        } catch (e) {
            await wait(1000);
            retries--;
        }
    }

    if (retries === 0) {
        console.error("Server failed to start.");
        process.exit(1);
    }

    console.log("Verifying agents...");
    const state = await fetchJson(`${API_URL}/state`);
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

    const missing = requiredRoles.filter(role => !agents.find((a: { role: string }) => a.role === role));

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

    let taskRes;
    try {
        taskRes = await fetchJson(`${API_URL}/tasks`, {
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
        await wait(1000);
        try {
            const newState = await fetchJson(`${API_URL}/state`);
            const task = newState.tasks.find((t: { id: number, assignedTo: string | null, interrupted: boolean }) => t.id === taskRes.task.id);
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
