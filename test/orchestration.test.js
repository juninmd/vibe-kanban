import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'timers/promises';
import { existsSync, rmSync } from 'node:fs';

const API_URL = 'http://localhost:5174';

describe('Orchestration API', async () => {
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
    // Ensure we are testing the built version
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
    // Reset orchestration to enabled by default
    await fetch(`${API_URL}/api/orchestrator/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
    });
  });

  after(() => {
    const cloneDir = './test-clones';
    if (existsSync(cloneDir)) rmSync(cloneDir, { recursive: true, force: true });
    if (serverProcess) serverProcess.kill();
  });

  test('Default: Auto-assigns tasks after interval', async () => {
    // 1. Create a task suitable for an idle agent (e.g., 'test' category)
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Auto Assign Task',
        category: 'test',
        priority: 'media'
      })
    });
    const { task } = await taskRes.json();

    // 2. Wait > 3000ms (interval is 3000ms)
    await setTimeout(6000);

    // 3. Verify assignment
    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.ok(updatedTask, 'Task should exist');
    // It's possible the task finished very quickly and is in 'done' state,
    // or it's still 'in_progress'. Either way, it should have been assigned.
    assert.ok(updatedTask.assignedTo || updatedTask.lane === 'done', 'Task should be assigned automatically or already done');
  });

  test('Disable Orchestration: Does not assign tasks automatically', async () => {
    // 1. Disable orchestration
    const configRes = await fetch(`${API_URL}/api/orchestrator/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
    });
    assert.equal(configRes.status, 200);

    // 2. Create task
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Manual Mode Task',
        category: 'test',
        priority: 'media'
      })
    });
    const { task } = await taskRes.json();

    // 3. Wait > 3000ms
    await setTimeout(5000);

    // 4. Verify NO assignment
    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.equal(updatedTask.assignedTo, null, 'Task should NOT be assigned when orchestration is disabled');
    assert.equal(updatedTask.lane, 'backlog');
  });

  test('Manual Trigger: Assigns task when triggered manually', async () => {
    // 1. Disable orchestration first
    await fetch(`${API_URL}/api/orchestrator/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false })
    });

    // 2. Create task
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Trigger Task',
        category: 'test',
        priority: 'media'
      })
    });
    const { task } = await taskRes.json();

    // 3. Call manual trigger
    const runRes = await fetch(`${API_URL}/api/orchestrator/run`, {
        method: 'POST'
    });
    assert.equal(runRes.status, 200);

    // Need a tiny wait for promises to resolve in the background (startTask sets timeout 0)
    await setTimeout(500);

    // 4. Verify assignment immediately
    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.ok(updatedTask.assignedTo, 'Task should be assigned after manual trigger');
    assert.equal(updatedTask.lane, 'in_progress');
  });
});
