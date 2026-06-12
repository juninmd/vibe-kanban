import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { API_URL, startTestServer } from './utils/testServer.ts';

describe('Vibe Kanban API', async () => {
  let serverProcess: ChildProcess;

  before(async () => {
    serverProcess = await startTestServer();
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
    const perfAgent = state.agents.find((a: { category: string, id: string }) => a.category === 'performance');

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
    const pmAgent = state.agents.find((a: { category: string, id: string }) => a.category === 'roadmap');

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
    assert.strictEqual(assignData.task.assignedTo, pmAgent.id);
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
    const backlogTask = state.tasks.find((t: { title: string }) => t.title === 'Task Backlog');
    const doneTask = state.tasks.find((t: { title: string }) => t.title === 'Task Done');

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


  test('POST /api/integrations/linear/sync fails when API key is missing', async () => {
    const res = await fetch(`${API_URL}/api/integrations/linear/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // no LINEAR_API_KEY
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'LINEAR_API_KEY is required');
  });

  test('POST /api/webhooks/trufflehog gracefully handles malformed missing payload', async () => {
    const res = await fetch(`${API_URL}/api/webhooks/trufflehog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // empty payload
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);

    // It should handle missing metadata fields without crashing and assign default title
    const stateRes = await fetch(`${API_URL}/api/state`);
    const stateData = await stateRes.json();
    const task = stateData.tasks.find((t: any) => t.title === 'Trufflehog: Secret vulnerability detected');
    assert.ok(task);
  });

  test('POST /api/webhooks/trufflehog creates a high-priority security task', async () => {
    const res = await fetch(`${API_URL}/api/webhooks/trufflehog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        DetectorName: "AWS",
        DecoderName: "BASE64",
        Raw: "AKIAIOSFODNN7EXAMPLE",
        SourceMetadata: {
          Data: {
            Github: {
              file: "src/config.ts",
              commit: "a1b2c3d4"
            }
          }
        }
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);

    const stateRes = await fetch(`${API_URL}/api/state`);
    const stateData = await stateRes.json();
    const securityTasks = stateData.tasks.filter((t: any) => t.source === 'trufflehog');
    assert.equal(securityTasks.length, 1);
    assert.equal(securityTasks[0].priority, 'alta');
    assert.equal(securityTasks[0].category, 'security');
    assert.ok(securityTasks[0].title.includes('AWS'));
    assert.ok(securityTasks[0].description.includes('src/config.ts'));
    assert.ok(securityTasks[0].description.includes('a1b2c3d4'));
  });

  test('GET /api/analytics returns correct default stats on reset', async () => {
    // DB.reset() clears all tasks and events but populates 6 default agents.
    await fetch(`${API_URL}/api/reset`, { method: 'POST' });

    const res = await fetch(`${API_URL}/api/analytics`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalTasks, 0); // Reset wipes tasks
    assert.equal(data.totalAgents, 6); // Reset creates 6 default agents
    assert.deepEqual(data.taskDistribution, {});
    assert.deepEqual(data.priorityDistribution, {});

    // Check that agentUtilization is correctly tracking 0 tasks for each of the 6 default agents
    assert.equal(Object.keys(data.agentUtilization).length, 6);
    for (const key in data.agentUtilization) {
      assert.equal(data.agentUtilization[key], 0);
    }
  });

  test('GET /api/analytics returns aggregated metrics', async () => {
    // Populate some data
    await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task 1', lane: 'backlog', priority: 'baixa', category: 'feature' })
    });
    const agentRes = await fetch(`${API_URL}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'test-agent', category: 'test', tool: 'mock', model: 'mock-model' })
    });
    const agentData = await agentRes.json();

    // Assign a task
    const stateRes = await fetch(`${API_URL}/api/state`);
    const stateData = await stateRes.json();
    const task = stateData.tasks.find((t: any) => t.title === 'Task 1');

    const actualAgentId = agentData.agent ? agentData.agent.id : agentData.id;

    await fetch(`${API_URL}/api/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, agentId: actualAgentId })
    });

    const res = await fetch(`${API_URL}/api/analytics`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(data.totalTasks >= 1);
    assert.ok(data.totalAgents >= 1);
    assert.equal(data.taskDistribution['in_progress'] || 0, 1);
    assert.ok(data.priorityDistribution['baixa'] >= 1);
    assert.equal(data.agentUtilization[actualAgentId], 1);
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
    assert.ok(data.acceptanceCriteria.some((item: string) => item.includes('PR/MR')));
  });
});
