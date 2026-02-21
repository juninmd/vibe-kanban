import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'timers/promises';

const API_URL = 'http://localhost:5174';

describe('Vibe Kanban API', async () => {
  let serverProcess;

  async function waitForServer() {
    for (let attempts = 0; attempts < 30; attempts++) {
      try {
        const res = await fetch(`${API_URL}/api/state`);
        if (res.ok) return true;
      } catch {
        // retry
      }
      await setTimeout(300);
    }
    return false;
  }

  before(async () => {
    serverProcess = spawn('node', ['dist/server.js'], {
      stdio: 'pipe',
      env: { ...process.env, PORT: '5174' }
    });

    const ready = await waitForServer();
    if (!ready) {
      serverProcess.kill();
      throw new Error('Server failed to start');
    }
  });

  beforeEach(async () => {
    await fetch(`${API_URL}/api/reset`, { method: 'POST' });
  });

  after(() => {
    if (serverProcess) serverProcess.kill();
  });

  test('GET /api/state returns valid initial state', async () => {
    const res = await fetch(`${API_URL}/api/state`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.tasks));
    assert.ok(Array.isArray(data.agents));
    assert.ok(Array.isArray(data.events));
    assert.equal(data.agents.length, 6);
  });

  test('POST /api/tasks creates and persists a card', async () => {
    const res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Task',
        source: 'test',
        category: 'testes',
        priority: 'media',
        githubRepo: 'acme/vibe'
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.task.title, 'Test Task');
    assert.equal(data.task.lane, 'backlog');

    const state = await (await fetch(`${API_URL}/api/state`)).json();
    assert.equal(state.tasks.length, 1);
    assert.equal(state.tasks[0].githubRepo, 'acme/vibe');
  });

  test('POST /api/assign sends task to in_progress and links agent', async () => {
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Perf Task', category: 'performance' })
    });
    const { task } = await taskRes.json();

    const assignRes = await fetch(`${API_URL}/api/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id })
    });

    assert.equal(assignRes.status, 200);
    const payload = await assignRes.json();
    assert.equal(payload.task.lane, 'in_progress');
    assert.ok(payload.task.assignedTo);
    assert.equal(payload.agent.status, 'working');
  });

  test('POST /api/move updates lane transitions', async () => {
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Roadmap task', category: 'roadmap' })
    });
    const { task } = await taskRes.json();

    const moveRes = await fetch(`${API_URL}/api/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, lane: 'review' })
    });

    assert.equal(moveRes.status, 200);
    const moved = await moveRes.json();
    assert.equal(moved.task.lane, 'review');
  });

  test('POST /api/reset clears all tasks', async () => {
    await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'To be deleted', source: 'test' })
    });

    const res = await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    assert.equal(res.status, 200);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    assert.equal(state.tasks.length, 0);
    assert.equal(state.agents.length, 6);
  });
});
