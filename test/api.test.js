import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { setTimeout } from 'timers/promises';

const API_URL = 'http://localhost:5174';

describe('Vibe Kanban API', async () => {
  let serverProcess;

  // Function to wait for server to be ready
  async function waitForServer() {
    let attempts = 0;
    while (attempts < 20) {
      try {
        const res = await fetch(`${API_URL}/api/state`);
        if (res.ok) return true;
      } catch (e) {
        // ignore
      }
      await setTimeout(500);
      attempts++;
    }
    return false;
  }

  // Start server before tests
  before(async () => {
    // Start the server
    console.log('Starting server...');
    serverProcess = spawn('node', ['dist/server.js'], {
      stdio: 'pipe', // capture output
      env: { ...process.env, PORT: '5174' }
    });

    serverProcess.stdout.on('data', (data) => {
      // console.log(`server stdout: ${data}`);
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`server stderr: ${data}`);
    });

    const ready = await waitForServer();
    if (!ready) {
      serverProcess.kill();
      throw new Error('Server failed to start');
    }
    console.log('Server started.');
  });

  // Stop server after tests
  after(() => {
    if (serverProcess) {
        console.log('Stopping server...');
        serverProcess.kill();
    }
  });

  test('GET /api/state returns valid initial state', async () => {
    const res = await fetch(`${API_URL}/api/state`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.tasks), 'tasks should be an array');
    assert.ok(Array.isArray(data.agents), 'agents should be an array');
    assert.ok(Array.isArray(data.events), 'events should be an array');
    assert.strictEqual(data.agents.length, 6, 'Should have 6 agents');
  });

  test('POST /api/tasks creates a new task', async () => {
    const newTask = {
      title: 'Test Task',
      source: 'test',
      category: 'testes',
      priority: 'media'
    };

    const res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask)
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.task.title, 'Test Task');
    assert.strictEqual(data.task.lane, 'backlog');
  });

  test('POST /api/reset resets the state', async () => {
    // Add a task first to ensure something to reset
    await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'To be deleted', source: 'test' })
    });

    const res = await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    assert.strictEqual(res.status, 200);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    assert.strictEqual(state.tasks.length, 0, 'Tasks should be empty after reset');
  });
});
