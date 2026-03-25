import type { State, Task } from '../src/types.js';

async function request<T = any>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`http://localhost:5174${path}`, options);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    await request('/api/reset', { method: 'POST' });
    await request('/api/orchestrator/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ enabled: true }) });
    const taskRes = await request<{ task: Task }>('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title: 'Test Task', category: 'feature' }) });
    await request('/api/orchestrator/run', { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await wait(1000);
        const state = await request<State>('/api/state');
        const task = state.tasks.find((t: Task) => t.id === taskRes.task.id);
        if (task?.assignedTo) {
            console.log('Assigned!');
            return;
        }
    }
    console.log('Not assigned');
}
run();
