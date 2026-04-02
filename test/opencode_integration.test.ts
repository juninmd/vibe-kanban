import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { OpenCodeDriver, buildOpenCodeArgs } from '../src/drivers/OpenCodeDriver.js';
import { resolveOpenCodeCommand } from '../src/utils/commandUtils.js';
import * as fs from 'fs';
import * as path from 'path';
import { Task, Agent, DriverContext } from '../src/types.js';

describe('OpenCodeDriver Integration', () => {
  const testDir = './test-clones-driver';
  const fakeBinDir = path.join(testDir, 'bin');
  const fakeOpenCodePath = path.join(fakeBinDir, process.platform === 'win32' ? 'opencode.cmd' : 'opencode');
  const originalOpenCodePath = process.env.OPENCODE_PATH;

  function writeFakeOpenCode() {
    fs.mkdirSync(fakeBinDir, { recursive: true });

    if (process.platform === 'win32') {
      fs.writeFileSync(
        fakeOpenCodePath,
        ['@echo off', 'echo FAKE OPENCODE %*', 'echo ^<^<^<FILE:hello.js^>^>^>', 'echo console.log("Hello, world!");', 'echo ^<^<^<END^>^>^>'].join('\r\n'),
        'utf8'
      );
    } else {
      fs.writeFileSync(
        fakeOpenCodePath,
        ['#!/bin/sh', 'printf "%s\\n" "FAKE OPENCODE $*" "<<<FILE:hello.js>>>" "console.log(\"Hello, world!\");" "<<<END>>>"'].join('\n'),
        'utf8'
      );
      fs.chmodSync(fakeOpenCodePath, 0o755);
    }
  }

  before(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir);
    writeFakeOpenCode();
    process.env.OPENCODE_PATH = path.resolve(fakeOpenCodePath);
  });

  after(() => {
    if (originalOpenCodePath) process.env.OPENCODE_PATH = originalOpenCodePath;
    else delete process.env.OPENCODE_PATH;
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  function createTestCtx(logsArr: string[], resolveCb: (value: unknown) => void, rejectCb: (reason?: any) => void): DriverContext {
    return {
      onLog: (id: number, msg: string) => { logsArr.push(msg); },
      onComplete: () => { resolveCb(undefined); },
      onBugFound: (id: number, desc: string) => { rejectCb(new Error(desc)); },
      onInterrupt: () => {},
      memory: { get: () => null, set: () => {}, getAll: () => ({}), clear: () => {} }
    };
  }

  test('resolveOpenCodeCommand prefers OPENCODE_PATH and then vibe_config.json', () => {
    const configDir = path.join(testDir, 'config-resolution');
    const configOnlyPath = path.join(configDir, process.platform === 'win32' ? 'config-opencode.cmd' : 'config-opencode');

    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'vibe_config.json'), JSON.stringify({ opencodePath: './config-opencode' + (process.platform === 'win32' ? '.cmd' : '') }), 'utf8');
    fs.writeFileSync(configOnlyPath, process.platform === 'win32' ? '@echo off\r\necho config' : '#!/bin/sh\necho config\n', 'utf8');
    if (process.platform !== 'win32') fs.chmodSync(configOnlyPath, 0o755);

    const envResolved = resolveOpenCodeCommand({ cwd: configDir, env: { OPENCODE_PATH: path.resolve(fakeOpenCodePath) } });
    assert.equal(envResolved.source, 'env');
    assert.equal(envResolved.command, path.resolve(fakeOpenCodePath));

    const configResolved = resolveOpenCodeCommand({ cwd: configDir, env: {} });
    assert.equal(configResolved.source, 'config');
    assert.equal(configResolved.command, path.resolve(configOnlyPath));
  });

  test('ExecuteTask uses custom executable path, task.workDir, and file block output', async () => {
    const logs: string[] = [];
    const driver = new OpenCodeDriver(() => testDir);
    const workDir = path.join(testDir, 'custom-workdir');
    fs.mkdirSync(workDir, { recursive: true });

    const task: Task = {
      id: 101,
      title: 'Create a simple hello world function',
      source: 'test',
      category: 'feature',
      priority: 'media',
      lane: 'in_progress',
      assignedTo: 'agent-opencode',
      interrupted: false,
      logs: [],
      workDir,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const agent: Agent = {
      id: 'agent-opencode',
      role: 'Developer',
      model: 'default',
      category: 'test',
      status: 'working',
      assignedTask: 101,
      tool: 'opencode',
      terminalId: 'term-1'
    };

    await new Promise((resolve, reject) => {
      const ctx = createTestCtx(logs, resolve, reject);
      driver.executeTask(task, agent, ctx).catch(reject);
    });

    const executableLog = logs.find(l => l.includes('OpenCode executable:'));
    const runLog = logs.find(l => l.startsWith('Running:'));
    assert.ok(executableLog?.includes(path.resolve(fakeOpenCodePath)), 'Should log the resolved executable path');
    assert.ok(runLog?.includes('run --agent build'), 'Command should include build agent for implementation work');
    assert.ok(fs.existsSync(path.join(workDir, 'hello.js')), 'File block output should be written into task.workDir');
    assert.equal(fs.existsSync(path.join(testDir, 'task-101', 'hello.js')), false, 'Fallback task directory should not be used when workDir is present');
  });

  test('ExecuteTask with custom model passes --model flag', async () => {
    const logs: string[] = [];
    const driver = new OpenCodeDriver(() => testDir);

    const task: Task = {
      id: 102,
      title: 'Test with custom model',
      source: 'test',
      category: 'test',
      priority: 'media',
      lane: 'in_progress',
      assignedTo: 'agent-ollama',
      interrupted: false,
      logs: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const agent: Agent = {
      id: 'agent-ollama',
      role: 'OllamaDev',
      model: 'ollama:llama3',
      category: 'test',
      status: 'working',
      assignedTask: 102,
      tool: 'opencode',
      terminalId: 'term-2'
    };

    await new Promise((resolve, reject) => {
      const ctx = createTestCtx(logs, resolve, reject);
      driver.executeTask(task, agent, ctx).catch(reject);
    });

    const runLog = logs.find(l => l.startsWith('Running:'));
    assert.ok(runLog, 'Should log the run command');
    assert.ok(runLog.includes('--model ollama:llama3'), 'Command should include --model flag');
  });

  test('buildOpenCodeArgs skips bare model names that OpenCode cannot resolve', () => {
    const args = buildOpenCodeArgs(
      {
        id: 103,
        title: 'Real CLI compatibility check',
        source: 'test',
        category: 'feature',
        priority: 'media',
        lane: 'backlog',
        assignedTo: null,
        interrupted: false,
        logs: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'agent-opencode',
        role: 'Developer',
        model: 'gpt-4o',
        category: 'feature',
        status: 'idle',
        assignedTask: null,
        tool: 'opencode',
        terminalId: 'term-3'
      },
      'Create hello.js'
    );

    assert.deepEqual(args, ['run', '--agent', 'build', 'Create hello.js']);
  });
});
