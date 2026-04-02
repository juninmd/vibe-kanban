import { Task, State } from '../src/types.js';
import { fetchJson, wait } from './test_helpers.js';

const API_URL = 'http://localhost:5174';

async function run(): Promise<void> {
    await fetchJson(`${API_URL}/api/reset`, { method: 'POST' });
    await fetchJson(`${API_URL}/api/orchestrator/config`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { enabled: true } });
    const taskRes = await fetchJson<{ task: Task }>(`${API_URL}/api/tasks`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { title: 'Test Task', category: 'feature' } });
    await fetchJson(`${API_URL}/api/orchestrator/run`, { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await wait(1000);
        const state: State = await fetchJson(`${API_URL}/api/state`);
        const task = state.tasks.find((t: Task) => t.id === taskRes.task?.id);
        if (task && task.assignedTo) {
            console.log('Assigned!');
            return;
        }
    }
    console.log('Not assigned');
}

await run().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
});
