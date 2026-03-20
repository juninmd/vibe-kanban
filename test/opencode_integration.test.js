import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { OpenCodeDriver } from "../dist/drivers/OpenCodeDriver.js";
import * as fs from "fs";
import * as path from "path";
import { isCommandAvailable } from "../dist/utils/commandUtils.js";

describe("OpenCodeDriver Integration", () => {
  const testDir = "./test-clones-driver";

  before(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir);
  });

  after(() => {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  });

  test("OpenCode is available in system", () => {
    const available = isCommandAvailable("opencode");
    assert.strictEqual(available, true, "OpenCode should be installed");
  });

  test("ExecuteTask runs actual OpenCode command", async () => {
    const logs = [];
    const driver = new OpenCodeDriver(() => testDir);

    const task = {
      id: 101,
      title: "Create a simple hello world function",
      source: "test",
      category: "test",
      priority: "media",
      lane: "in_progress",
      assignedTo: "agent-opencode",
      interrupted: false,
      logs: [],
    };

    const agent = {
      id: "agent-opencode",
      role: "Developer",
      model: "default",
      category: "test",
      status: "working",
      assignedTask: 101,
      tool: "opencode",
      terminalId: "term-1",
    };

    const ctx = {
      onLog: (id, msg) => logs.push(msg),
      onComplete: (id) => {},
      onBugFound: (id, desc) => {},
      onInterrupt: (id) => {},
    };

    await driver.executeTask(task, agent, ctx);

    const runLog = logs.find((l) => l.startsWith("Running: opencode"));
    assert.ok(runLog, "Should log the run command");
    assert.ok(runLog.includes("opencode run"), "Command should include opencode run");

    await driver.interruptTask(task);
  });

  test("ExecuteTask with custom model passes --model flag", async () => {
    const logs = [];
    const driver = new OpenCodeDriver(() => testDir);

    const task = {
      id: 102,
      title: "Test with custom model",
      source: "test",
      category: "test",
      priority: "media",
      lane: "in_progress",
      assignedTo: "agent-ollama",
      interrupted: false,
      logs: [],
    };

    const agent = {
      id: "agent-ollama",
      role: "OllamaDev",
      model: "ollama:llama3",
      category: "test",
      status: "working",
      assignedTask: 102,
      tool: "opencode",
      terminalId: "term-2",
    };

    const ctx = {
      onLog: (id, msg) => logs.push(msg),
      onComplete: (id) => {},
      onBugFound: (id, desc) => {},
      onInterrupt: (id) => {},
    };

    await driver.executeTask(task, agent, ctx);

    const runLog = logs.find((l) => l.startsWith("Running: opencode"));
    assert.ok(runLog, "Should log the run command");
    assert.ok(runLog.includes("--model ollama:llama3"), "Command should include --model flag");

    await driver.interruptTask(task);
  });
});
