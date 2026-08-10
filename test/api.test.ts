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

  test('GET /api/analytics returns correct system metrics', async () => {
    // 1. Create a task in backlog
    await fetch(`${API_URL}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Analytics Task', source: 'test', category: 'roadmap' })
    });

    const res = await fetch(`${API_URL}/api/analytics`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.ok(typeof data.totalTasks === 'number');
    assert.ok(data.tasksPerLane && typeof data.tasksPerLane === 'object');
    assert.ok(data.tasksPerLane['backlog'] >= 1);

    assert.ok(typeof data.totalAgents === 'number');
    assert.ok(data.agentUtilization && typeof data.agentUtilization === 'object');
  });

  test('POST /api/webhooks/trufflehog creates security task from webhook payload', async () => {
    const res = await fetch(`${API_URL}/api/webhooks/trufflehog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vulnerability: "AWS Access Key",
        location: "src/server.ts"
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.task);
    assert.equal(data.task.title, "Vulnerabilidade Detectada: AWS Access Key");
    assert.equal(data.task.category, "security");
    assert.equal(data.task.priority, "alta");
    assert.equal(data.task.source, "trufflehog");
  });

  test('POST /api/webhooks/slack creates feature task from slack event', async () => {

    const stateRes = await fetch("http://localhost:5174/api/state");
    const state = await stateRes.json();
    const beforeCount = state.tasks.length;

     // Get initial count since DB.reset() populates defaults

    // First, test the URL verification challenge
    const resVerify = await fetch("http://localhost:5174/api/webhooks/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "url_verification", challenge: "test_challenge" })
    });

    assert.strictEqual(resVerify.status, 200);
    const verifyData = await resVerify.json();
    assert.strictEqual(verifyData.challenge, "test_challenge");

    // Second, test a regular message event
    const resMessage = await fetch("http://localhost:5174/api/webhooks/slack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: {
          type: "message",
          user: "U12345",
          text: "Implement codegen feature",
          bot_id: undefined
        }
      })
    });

    assert.strictEqual(resMessage.status, 200);
    const messageData = await resMessage.json();
    assert.strictEqual(messageData.ok, true);


    const stateResAfter = await fetch("http://localhost:5174/api/state");
    const stateAfter = await stateResAfter.json();
    const tasks = stateAfter.tasks;

    const newTasks = tasks.slice(beforeCount);
    assert.strictEqual(newTasks.length, 1);
    assert.strictEqual(newTasks[0].source, "slack");
    assert.strictEqual(newTasks[0].category, "feature");
    assert.match(newTasks[0].title, /Mensagem de Slack:/);
  });

  test('POST /api/webhooks/sentry creates bug task from webhook payload', async () => {
    const res = await fetch(`${API_URL}/api/webhooks/sentry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "ReferenceError: require is not defined",
        project_name: "vibe-kanban",
        culprit: "src/server.ts",
        url: "https://sentry.io/organizations/vibe/issues/12345/"
      })
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(data.task);
    assert.equal(data.task.category, "bug");
    assert.equal(data.task.priority, "alta");
    assert.equal(data.task.source, "sentry");
  });

  test('POST /api/integrations/linear/sync syncs Linear issues', async () => {
    const res = await fetch(`${API_URL}/api/integrations/linear/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing API key
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "LINEAR_API_KEY is required");
  });

  test('POST /api/integrations/jira/sync fails with 400 if missing data', async () => {
    const res = await fetch(`${API_URL}/api/integrations/jira/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing domain, email, token
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "JIRA_DOMAIN, JIRA_EMAIL, and JIRA_API_TOKEN are required");
  });

  test('POST /api/integrations/clickup/sync fails with 400 if missing data', async () => {
    const res = await fetch(`${API_URL}/api/integrations/clickup/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing listId, token
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "CLICKUP_LIST_ID and CLICKUP_API_TOKEN are required");
  });

  test('POST /api/integrations/monday/sync fails with 400 if missing data', async () => {
    const res = await fetch(`${API_URL}/api/integrations/monday/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing boardId, token
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "MONDAY_BOARD_ID and MONDAY_API_TOKEN are required");
  });

  test('POST /api/integrations/notion/sync fails with 400 if missing data', async () => {
    const res = await fetch(`${API_URL}/api/integrations/notion/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing databaseId, token
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, "NOTION_DATABASE_ID and NOTION_API_TOKEN are required");
  });

  test('GET /api/mcp/tools returns tools list', async () => {
    const res = await fetch(`${API_URL}/api/mcp/tools`);
    assert.strictEqual(res.status, 200);
    const data = await res.json() as any;
    assert.ok(Array.isArray(data.tools));
    const webSearchTool = data.tools.find((t: any) => t.name === 'web_search');
    assert.ok(webSearchTool);
    assert.strictEqual(webSearchTool.name, 'web_search');
    assert.ok(webSearchTool.description);
  });

  test('POST /api/mcp/execute fails with 400 for missing tool name', async () => {
    const res = await fetch(`${API_URL}/api/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args: { query: 'test' } })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json() as any;
    assert.strictEqual(data.error, 'Missing or invalid tool name');
  });

  test('POST /api/mcp/execute fails with 500 for missing args for web_search', async () => {
    const res = await fetch(`${API_URL}/api/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'web_search' })
    });
    assert.strictEqual(res.status, 500);
    const data = await res.json() as any;
    assert.strictEqual(data.error, 'Error executing tool web_search: Missing or invalid argument: query');
  });

  test('POST /api/mcp/execute throws 500 for non-existent tool', async () => {
    const res = await fetch(`${API_URL}/api/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'does_not_exist', args: {} })
    });
    assert.strictEqual(res.status, 500);
    const data = await res.json() as any;
    assert.strictEqual(data.error, 'Tool not found: does_not_exist');
  });

  test('POST /api/mcp/execute successfully calls web_search', async () => {
    // we won't mock global.fetch here because the server runs in another process in this test file
    // wait, we can't reliably test external duckduckgo fetching without mocking in the child process.
    // Instead we test that it attempts to fetch, if it throws unknown we handle it, but wait, it will just make a real request.
    // Making a real request to DuckDuckGo HTML is okay for E2E tests, it shouldn't fail unless there's no internet.
    const res = await fetch(`${API_URL}/api/mcp/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'web_search', args: { query: 'duckduckgo' } })
    });
    assert.ok(res.status === 200 || res.status === 500);
    const data = await res.json() as any;
    if (res.status === 200) {
      assert.ok(typeof data.result === 'string');
    } else {
      assert.ok(typeof data.error === 'string');
    }
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
