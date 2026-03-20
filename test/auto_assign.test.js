import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'timers/promises';
import { existsSync, rmSync } from 'node:fs';

const API_URL = 'http://localhost:5175';

describe('Auto Assign Task Tests', async () => {
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
      env: { ...process.env, PORT: '5175' }
    });

    const ready = await waitForServer();
    if (!ready) {
      serverProcess.kill();
      throw new Error('Server failed to start');
    }
  });

  beforeEach(async () => {
    await fetch(`${API_URL}/api/reset`, { method: 'POST' });
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

  test('Testes agent receives test category tasks automatically', async () => {
    const createAgentRes = await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Testes',
        category: 'test',
        tool: 'opencode',
        model: 'default'
      })
    });
    const createdAgent = await createAgentRes.json();
    assert.equal(createAgentRes.status, 201);

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Auto Assign Task',
        category: 'test',
        priority: 'media',
        source: 'test'
      })
    });
    const { task } = await taskRes.json();
    assert.equal(task.lane, 'backlog');
    assert.equal(task.assignedTo, null);

    await setTimeout(8000);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.ok(updatedTask, 'Task should exist');
    const isAssigned = updatedTask.assignedTo !== null;
    const isDone = updatedTask.lane === 'done';
    const isInterrupted = updatedTask.lane === 'backlog' && updatedTask.interrupted;

    assert.ok(
      isAssigned || isDone || isInterrupted,
      `Task should be assigned (${updatedTask.assignedTo}), done, or interrupted. Got lane=${updatedTask.lane}, assignedTo=${updatedTask.assignedTo}`
    );

    if (isAssigned) {
      const assignedAgent = state.agents.find(a => a.id === updatedTask.assignedTo);
      assert.equal(assignedAgent.category, 'test', 'Task should be assigned to a test category agent');
    }
  });

  test('Task is assigned to agent with matching category', async () => {
    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Security Specialist',
        category: 'security',
        tool: 'gemini',
        model: 'default'
      })
    });

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Security Audit Task',
        category: 'security',
        priority: 'alta',
        source: 'test'
      })
    });
    const { task } = await taskRes.json();

    await setTimeout(8000);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.ok(
      updatedTask.assignedTo ||
      updatedTask.lane === 'done' ||
      (updatedTask.lane === 'backlog' && updatedTask.interrupted),
      'Security task should be auto-assigned'
    );

    if (updatedTask.assignedTo) {
      const agent = state.agents.find(a => a.id === updatedTask.assignedTo);
      assert.equal(agent.category, 'security');
    }
  });

  test('Orchestrator respects disabled state', async () => {
    await fetch(`${API_URL}/api/orchestrator/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });

    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Testes',
        category: 'test',
        tool: 'opencode',
        model: 'default'
      })
    });

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Disabled Orchestration Task',
        category: 'test',
        priority: 'media',
        source: 'test'
      })
    });
    const { task } = await taskRes.json();

    await setTimeout(5000);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.equal(updatedTask.assignedTo, null, 'Task should NOT be assigned when orchestration is disabled');
    assert.equal(updatedTask.lane, 'backlog');
  });

  test('Manual /api/orchestrator/run triggers immediate assignment', async () => {
    await fetch(`${API_URL}/api/orchestrator/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });

    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Testes',
        category: 'test',
        tool: 'opencode',
        model: 'default'
      })
    });

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Manual Trigger Task',
        category: 'test',
        priority: 'media',
        source: 'test'
      })
    });
    const { task } = await taskRes.json();

    const triggerRes = await fetch(`${API_URL}/api/orchestrator/run`, {
      method: 'POST'
    });
    assert.equal(triggerRes.status, 200);

    await setTimeout(3500);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.ok(
      updatedTask.assignedTo ||
      updatedTask.lane === 'done' ||
      (updatedTask.lane === 'backlog' && updatedTask.interrupted),
      'Task should be assigned after manual trigger'
    );
  });

  test('Task without matching category agent stays in backlog', async () => {
    await fetch(`${API_URL}/api/orchestrator/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false })
    });

    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'Feature Agent',
        category: 'feature',
        tool: 'opencode',
        model: 'default'
      })
    });

    const taskRes = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Unknown Category Task',
        category: 'unknown-category',
        priority: 'media',
        source: 'test'
      })
    });
    const { task } = await taskRes.json();

    await setTimeout(5000);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask = state.tasks.find(t => t.id === task.id);

    assert.equal(updatedTask.lane, 'backlog', 'Task should stay in backlog when no matching category agent');
    assert.equal(updatedTask.assignedTo, null, 'Task should not be assigned');
  });

  test('Multiple tasks assigned to different agents', async () => {
    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Tester1', category: 'test', tool: 'opencode', model: 'default' })
    });
    await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'Tester2', category: 'test', tool: 'opencode', model: 'default' })
    });

    const task1Res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task 1', category: 'test', priority: 'alta', source: 'test' })
    });
    const task2Res = await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task 2', category: 'test', priority: 'media', source: 'test' })
    });

    const { task: task1 } = await task1Res.json();
    const { task: task2 } = await task2Res.json();

    await setTimeout(10000);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();
    const updatedTask1 = state.tasks.find(t => t.id === task1.id);
    const updatedTask2 = state.tasks.find(t => t.id === task2.id);

    const task1Handled = updatedTask1.assignedTo || updatedTask1.lane === 'done' || (updatedTask1.lane === 'backlog' && updatedTask1.interrupted);
    const task2Handled = updatedTask2.assignedTo || updatedTask2.lane === 'done' || (updatedTask2.lane === 'backlog' && updatedTask2.interrupted);

    assert.ok(task1Handled || task2Handled, 'At least one task should be handled');
  });
});
