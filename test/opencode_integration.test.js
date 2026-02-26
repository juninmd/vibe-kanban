import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeDriver } from '../dist/drivers/OpenCodeDriver.js';
import * as fs from 'fs';
import * as path from 'path';

// Subclass to override protected methods for testing
class TestOpenCodeDriver extends OpenCodeDriver {
    constructor(getCloneDir) {
        super(getCloneDir);
        this.mockInstalled = true;
        this.mockInstallSuccess = true;
        this.installCalled = false;
    }

    // We override these to avoid actual CLI calls
    checkInstalled() {
        return this.mockInstalled;
    }

    installOpenCode(ctx, taskId) {
        this.installCalled = true;
        if (this.mockInstallSuccess) {
            ctx.onLog(taskId, "✅ OpenCode installed successfully.");
            return true;
        } else {
            ctx.onLog(taskId, "❌ Installation failed: Mock Error");
            return false;
        }
    }
}

describe('OpenCodeDriver Integration', () => {
  const testDir = './test-clones-driver';

  before(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir);
  });

  after(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test('Ollama Integration: Passes --model flag correctly', async () => {
    const logs = [];
    const driver = new TestOpenCodeDriver(() => testDir);
    driver.mockInstalled = true; // Simulate installed

    const task = {
      id: 101,
      title: 'Run with Ollama',
      source: 'test',
      category: 'test',
      priority: 'media',
      lane: 'in_progress',
      assignedTo: 'agent-ollama',
      interrupted: false,
      logs: []
    };

    const agent = {
      id: 'agent-ollama',
      role: 'OllamaDev',
      model: 'ollama:llama3',
      category: 'test',
      status: 'working',
      assignedTask: 101,
      tool: 'opencode',
      terminalId: 'term-1'
    };

    const ctx = {
      onLog: (id, msg) => logs.push(msg),
      onComplete: () => {},
      onBugFound: () => {},
      onInterrupt: () => {}
    };

    // We expect executeTask to spawn the process.
    // Since we mocked checkInstalled to true, it will proceed to spawn.
    // The actual spawn call will fail because `opencode` is not in path (in reality),
    // but the LOG message is generated BEFORE spawn.
    // We catch the spawn error (ENOENT) inside the driver, so executeTask resolves.

    await driver.executeTask(task, agent, ctx);

    // Verify the command log
    const runLog = logs.find(l => l.startsWith('Running: opencode run'));
    assert.ok(runLog, 'Should log the run command');
    assert.ok(runLog.includes('--model ollama:llama3'), 'Command should include --model flag');
  });

  test('Auto-Installation: Attempts install when missing', async () => {
    const logs = [];
    const driver = new TestOpenCodeDriver(() => testDir);
    driver.mockInstalled = false; // Simulate NOT installed
    driver.mockInstallSuccess = true; // Simulate successful install

    const task = {
      id: 102,
      title: 'Install Test',
      source: 'test',
      category: 'test',
      priority: 'media',
      lane: 'in_progress',
      assignedTo: 'agent-install',
      interrupted: false,
      logs: []
    };

    const agent = {
      id: 'agent-install',
      role: 'Installer',
      model: 'default',
      category: 'test',
      status: 'working',
      assignedTask: 102,
      tool: 'opencode',
      terminalId: 'term-2'
    };

    const ctx = {
      onLog: (id, msg) => logs.push(msg),
      onComplete: () => {},
      onBugFound: () => {},
      onInterrupt: () => {}
    };

    await driver.executeTask(task, agent, ctx);

    assert.ok(driver.installCalled, 'Should verify installation was attempted');
    assert.ok(logs.some(l => l.includes('OpenCode installed successfully')), 'Should log success');

    // Verify it proceeded to run command after install
    const runLog = logs.find(l => l.startsWith('Running: opencode run'));
    assert.ok(runLog, 'Should proceed to run command after installation');
  });

  test('Simulation Fallback: Switches to simulation on install failure', async () => {
    const logs = [];
    const driver = new TestOpenCodeDriver(() => testDir);
    driver.mockInstalled = false;
    driver.mockInstallSuccess = false; // Simulate failure

    const task = {
      id: 103,
      title: 'Sim Test',
      source: 'test',
      category: 'test',
      priority: 'media',
      lane: 'in_progress',
      assignedTo: 'agent-sim',
      interrupted: false,
      logs: []
    };

    const agent = {
      id: 'agent-sim',
      role: 'SimUser',
      model: 'default',
      category: 'test',
      status: 'working',
      assignedTask: 103,
      tool: 'opencode',
      terminalId: 'term-3'
    };

    const ctx = {
      onLog: (id, msg) => logs.push(msg),
      onComplete: () => {},
      onBugFound: () => {},
      onInterrupt: () => {}
    };

    // executeTask calls runSimulation which runs asynchronously via setInterval.
    // It returns immediately.
    // We just want to verify it LOGGED the switch.
    await driver.executeTask(task, agent, ctx);

    assert.ok(driver.installCalled, 'Should attempt install');
    assert.ok(logs.some(l => l.includes('Switching to SIMULATION MODE')), 'Should log switch to simulation');

    // Clean up interval (runSimulation uses setInterval)
    await driver.interruptTask(task);
  });
});
