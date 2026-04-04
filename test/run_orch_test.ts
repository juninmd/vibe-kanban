function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
}

async function request(path: string, options: RequestOptions = {}) {
    const url = `http://localhost:5174${path}`;
    const res = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    return res.json();
}

async function run() {
    await request('/api/reset', { method: 'POST' });
    await request('/api/orchestrator/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { enabled: true } });
    const taskRes = await request('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { title: 'Test Task', category: 'feature' } });
    await request('/api/orchestrator/run', { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await wait(1000);
        const state = await request('/api/state');
        const task = state.tasks.find((t: { id: number; assignedTo: string | null }) => t.id === taskRes.task.id);
        if (task.assignedTo) {
            console.log('Assigned!');
            return;
        }
    }
    console.log('Not assigned');
}
run();
