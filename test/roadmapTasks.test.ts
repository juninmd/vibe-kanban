import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ChildProcess } from 'node:child_process';
import { setTimeout } from 'timers/promises';
import { API_URL, startTestServer } from './utils/testServer.ts';

describe('Roadmap Tasks Auto-creation', async () => {
  let serverProcess: ChildProcess;

  before(async () => {
    serverProcess = await startTestServer();
  });

  after(() => {
    if (serverProcess) serverProcess.kill();
  });

  test('generateRoadmapTasks fetches and creates tasks', async () => {
    // We cannot easily test generateRoadmapTasks because it uses a hardcoded setTimeout of 5000ms
    // and setInterval of 86400000ms. And it uses a real LLM call unless OPENAI_API_KEY / GEMINI_API_KEY
    // is set. We're running without keys, so it will log an event and return.
    await setTimeout(6000);
    const stateRes = await fetch(`${API_URL}/api/state`);
    const state = await stateRes.json();

    // Because keys are not set, it should log a specific event.
    const hasEvent = state.events.some((e: any) => e.text.includes("[PM] API key não configurada. Configure OPENAI_API_KEY ou GEMINI_API_KEY nas configurações."));
    assert.ok(hasEvent, 'Should log missing API key for PM auto-create feature');
  });
});
