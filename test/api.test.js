import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'timers/promises';
import { existsSync, rmSync } from 'node:fs';

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
    const cloneDir = './test-clones';
    if (existsSync(cloneDir)) rmSync(cloneDir, { recursive: true, force: true });
    if (serverProcess) serverProcess.kill();
  });

  test('GET /api/state returns valid initial state', async () => {
    const res = await fetch(`${API_URL}/api/state`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(Array.isArray(data.tasks));
    assert.ok(Array.isArray(data.agents));
    assert.ok(Array.isArray(data.events));
  });

  test('POST /api/tasks creates and persists a card', async () => {
    const res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test Task',
        source: 'test',
        category: 'test',
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
    // Create an agent first to ensure one exists for the test
    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Performance', category: 'performance', tool: 'copilot', model: 'default' })
    });
    const agentsRes = await fetch(`${API_URL}/api/state`);
    const state = await agentsRes.json();
    const perfAgent = state.agents.find(a => a.category === 'performance');

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Perf Task', category: 'performance' })
    });
    const { task } = await taskRes.json();

    const assignRes = await fetch(`${API_URL}/api/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, agentId: perfAgent.id })
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
      body: JSON.stringify({ title: 'To be deleted', source: 'test', category: 'test' })
    });

    const res = await fetch(`${API_URL}/api/reset`, { method: 'POST' });
    assert.equal(res.status, 200);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    assert.equal(state.tasks.length, 0);
  });

  test('POST /api/config/clone-dir normaliza caminho e cria diretório', async () => {
    const res = await fetch(`${API_URL}/api/config/clone-dir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cloneDir: ' ./test-clones/ ' })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    const expectedPath = 'test-clones'.replace(/\\/g, '/') + '/';
    const actualPath = data.cloneDir.replace(/\\/g, '/');
    assert.equal(actualPath, expectedPath);
    assert.equal(existsSync('test-clones'), true);
  });

  test('POST /api/assign assigns a task', async () => {
    // Create an agent first to ensure one exists for the test
    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Product Manager', category: 'roadmap', tool: 'openai', model: 'default' })
    });
    const agentsRes = await fetch(`${API_URL}/api/state`);
    const state = await agentsRes.json();
    const pmAgent = state.agents.find(a => a.category === 'roadmap');

    // 1. Create task
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task to assign', source: 'test', category: 'roadmap' })
    });
    const taskData = await taskRes.json();
    const taskId = taskData.task.id;

    // 2. Assign task
    const assignRes = await fetch(`${API_URL}/api/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId, agentId: pmAgent.id })
    });
    assert.strictEqual(assignRes.status, 200);
    const assignData = await assignRes.json();
    assert.strictEqual(assignData.task.assignedTo, assignData.agent.id);
    assert.strictEqual(assignData.task.lane, 'in_progress');
  });

  test('POST /api/tasks/clear-done deletes only done tasks', async () => {
    // 1. Create a task in backlog
    await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task Backlog', source: 'test', category: 'roadmap', lane: 'backlog' })
    });

    // 2. Create a task and move to done
    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task Done', source: 'test', category: 'roadmap' })
    });
    const taskData = await taskRes.json();
    await fetch(`${API_URL}/api/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: taskData.task.id, lane: 'done' })
    });

    // 3. Call clear-done
    const clearRes = await fetch(`${API_URL}/api/tasks/clear-done`, {
      method: 'POST'
    });
    assert.equal(clearRes.status, 200);

    // 4. Verify state
    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const backlogTask = state.tasks.find(t => t.title === 'Task Backlog');
    const doneTask = state.tasks.find(t => t.title === 'Task Done');

    assert.ok(backlogTask, 'Backlog task should remain');
    assert.ok(!doneTask, 'Done task should be deleted');
  });

  test('GET /index.html returns static file', async () => {
    const res = await fetch(`${API_URL}/index.html`);
    assert.strictEqual(res.status, 200);
    const text = await res.text();
    assert.ok(text.includes('Vibe Kanban'), 'Should contain title');
  });

  test('GET /api/tooling/landscape returns tooling and vcs insights', async () => {
    const res = await fetch(`${API_URL}/api/tooling/landscape`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(typeof data.detectedAt, 'string');
    assert.ok(Array.isArray(data.tools));
    assert.ok(Array.isArray(data.vcsProviders));
    assert.ok(Array.isArray(data.businessRecommendations));
  });

  test('POST /api/demands/intake enriches remote demand with business requirements', async () => {
    const res = await fetch(`${API_URL}/api/demands/intake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Orquestrar entregas remotas em SaaS',
        description: 'Fluxo para segurança e multi-tenant',
        repoUrl: 'https://github.com/acme/vibe-kanban'
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.demand.provider, 'github');
    assert.ok(Array.isArray(data.businessRequirements));
    assert.ok(data.businessRequirements.length >= 3);
    assert.ok(data.acceptanceCriteria.some((item) => item.includes('PR/MR')));
  });
});
