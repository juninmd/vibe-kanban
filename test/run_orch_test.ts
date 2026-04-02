import { Task, State } from '../src/types.js';

interface RequestOptions extends Omit<RequestInit, 'body'> {
    body?: any;
}

function request(path: string, options: RequestOptions = {}): Promise<any> {
    const url = `http://localhost:5174${path}`;
    return fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        body: options.body ? JSON.stringify(options.body) : undefined
    }).then(res => res.json());
}

function wait(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function run(): Promise<void> {
    await request('/api/reset', { method: 'POST' });
    await request('/api/orchestrator/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { enabled: true } });
    const taskRes = await request('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { title: 'Test Task', category: 'feature' } });
    await request('/api/orchestrator/run', { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await wait(1000);
        const state: State = await request('/api/state');
        const task = state.tasks.find((t: Task) => t.id === taskRes.task.id);
        if (task && task.assignedTo) {
            console.log('Assigned!');
            return;
        }
    }
    console.log('Not assigned');
}

run().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
