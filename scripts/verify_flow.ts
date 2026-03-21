import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { setTimeout } from 'timers/promises';

const API_URL = 'http://localhost:5174';
const CLONE_DIR = './test-verification-clones';

async function run() {
  console.log('Starting Verification Flow...');

  // 1. Start Server
  const server = spawn('node', ['dist/server.js'], {
    stdio: 'pipe',
    env: { ...process.env, PORT: '5174' },
  });

  // Capture output for debugging
  server.stdout.on('data', (d) => process.stdout.write(`[SERVER] ${d}`));
  server.stderr.on('data', (d) => process.stderr.write(`[SERVER ERR] ${d}`));

  try {
    // Wait for server to be ready
    let ready = false;
    for (let i = 0; i < 20; i++) {
      try {
        await fetch(`${API_URL}/api/state`);
        ready = true;
        break;
      } catch (e) {
        await setTimeout(500);
      }
    }

    if (!ready) throw new Error('Server failed to start.');
    console.log('Server is ready.');

    // 2. Configure Clone Dir
    if (fs.existsSync(CLONE_DIR)) fs.rmSync(CLONE_DIR, { recursive: true, force: true });

    await fetch(`${API_URL}/api/config/clone-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloneDir: CLONE_DIR }),
    });
    console.log(`Configured clone dir: ${CLONE_DIR}`);

    // 3. Configure real driver (sem mocks)
    // Usamos um driver real (por padrão, OpenCode) e deixamos o fluxo falhar
    // explicitamente caso a CLI não esteja instalada ou configurada.
    const driver = process.env.VIBE_VERIFY_DRIVER || 'opencode';
    await fetch(`${API_URL}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driver }),
    });

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Verify File Creation',
        category: 'test',
        priority: 'alta',
        description: 'Create a verification file.',
      }),
    });
    const taskData: any = await taskRes.json();
    const taskId = taskData.task.id;
    console.log(`Created Task #${taskId}`);

    // 4. Assign Task (AutoAssign runs every 3s, but let's manual assign to be faster)
    const assignRes = await fetch(`${API_URL}/api/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    });
    const assignData: any = await assignRes.json();
    console.log(`Assigned Task #${taskId} to Agent ${assignData.agent.role}`);

    // 5. Wait for file creation
    console.log('Waiting for agent to work...');

    const taskDir = path.join(CLONE_DIR, `task-${taskId}`);
    let found = false;

    for (let i = 0; i < 20; i++) {
      await setTimeout(1000);
      // Check for file
      const fileCheck = path.join(taskDir, 'solution.ts');
      if (fs.existsSync(fileCheck)) {
        console.log(`[SUCCESS] File created: ${fileCheck}`);
        const content = fs.readFileSync(fileCheck, 'utf-8');
        console.log(`Content: ${content}`);
        found = true;
        break;
      } else {
        // Check status
        const stateRes = await fetch(`${API_URL}/api/state`);
        const state: any = await stateRes.json();
        const task = state.tasks.find((t: any) => t.id === taskId);
        if (task.lane === 'done' && !found) {
          console.log('Task finished but file not found?');
          // Maybe it wrote plan.md instead?
          if (fs.existsSync(path.join(taskDir, 'plan.md'))) {
            console.log(`[SUCCESS] Found plan.md instead.`);
            found = true;
            break;
          }
        }
      }
    }

    if (!found) throw new Error('Agent finished but no file was created.');
  } catch (e) {
    console.error('Verification Failed:', e);
    process.exit(1);
  } finally {
    server.kill();
    // Clean up? Maybe leave for inspection.
    // if (fs.existsSync(CLONE_DIR)) fs.rmSync(CLONE_DIR, { recursive: true, force: true });
  }
}

run();
