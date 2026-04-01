import http from 'http';

interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
}

interface TaskState {
    id: number;
    assignedTo: string | null;
}

interface SystemState {
    tasks: TaskState[];
}

function request(path: string, options: RequestOptions = {}): Promise<any> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 5174,
            path: path,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, res => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        if (options.body) req.write(JSON.stringify(options.body));
        req.end();
    });
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
    await request('/api/reset', { method: 'POST' });
    await request('/api/orchestrator/config', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { enabled: true } });
    const taskRes = await request('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: { title: 'Test Task', category: 'feature' } });
    await request('/api/orchestrator/run', { method: 'POST' });

    for (let i = 0; i < 5; i++) {
        await wait(1000);
        const state: SystemState = await request('/api/state');
        const task = state.tasks.find((t: TaskState) => t.id === taskRes.task.id);
        if (task && task.assignedTo) {
            console.log('Assigned!');
            return;
        }
    }
    console.log('Not assigned');
}
run();
