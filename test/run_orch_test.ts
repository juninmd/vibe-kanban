import type { State, Task } from '../src/types.js';
import { setTimeout } from 'timers/promises';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`http://localhost:5174${path}`, options);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
}

async function run() {
    await request<void>('/api/reset', { method: 'POST' });
    await request<void>('/api/orchestrator/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ enabled: true }) });
    const taskRes = await request<{ task: Task }>('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ title: 'Test Task', category: 'feature' }) });
    await request<void>('/api/orchestrator/run', { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await setTimeout(1000);
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
