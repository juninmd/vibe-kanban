import type { Task } from '../src/types.js';

function request(path: string, options: RequestInit & { body?: unknown } = {}) {
    return fetch(`http://localhost:5174${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
    }).then(res => res.json());
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    await request('/api/reset', { method: 'POST' });
    await request('/api/orchestrator/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { enabled: true } });
    const taskRes = await request('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { title: 'Test Task', category: 'feature' } });
    await request('/api/orchestrator/run', { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await wait(1000);
        const state = await request('/api/state');
        const task = state.tasks.find((t: Task) => t.id === taskRes.task.id);
        if (task.assignedTo) {
            console.log('Assigned!');
            return;
        }
    }
    console.log('Not assigned');
}
run();
