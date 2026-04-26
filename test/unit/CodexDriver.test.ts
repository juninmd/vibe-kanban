import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { EventEmitter } from "node:events";
import { CodexDriver } from "../../src/drivers/CodexDriver.js";
import { Task, Agent, DriverContext } from "../../src/types.js";

describe("CodexDriver", () => {
    let mockCtx: DriverContext;
    const getCloneDir = () => "/tmp/mock-clone-dir-" + Date.now();
    let driver: CodexDriver;

    beforeEach(() => {
        mockCtx = {
            onLog: mock.fn(),
            onComplete: mock.fn(),
            onBugFound: mock.fn(),
            onInterrupt: mock.fn(),
            memory: {} as any
        };
        driver = new CodexDriver(getCloneDir);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it("should instantiate with expected name", () => {
        assert.strictEqual(driver.name, "Codex Engine");
    });

    it("should return empty array from getLogs", () => {
        const logs = driver.getLogs(1);
        assert.deepStrictEqual(logs, []);
    });

    it("should interrupt running task using kill", async () => {
        const task: Task = { id: 42, title: "Test Task", status: "todo", agentType: "build", agent: "Codex", category: "feature", priority: "alta", createdAt: Date.now() };

        const mockProc = new EventEmitter();
        (mockProc as any).kill = mock.fn();
        (mockProc as any).killed = false;

        (driver as any).runningTasks.set(task.id, mockProc);

        await driver.interruptTask(task);
        assert.strictEqual((mockProc as any).kill.mock.callCount(), 1, "kill should be called");
        assert.ok(!(driver as any).runningTasks.has(task.id), "Task should be removed from runningTasks");
    });

    it("should safely handle interrupt if process is already killed", async () => {
        const task: Task = { id: 43, title: "Test Task", status: "todo", agentType: "build", agent: "Codex", category: "feature", priority: "alta", createdAt: Date.now() };

        const mockProc = new EventEmitter();
        (mockProc as any).kill = mock.fn();
        (mockProc as any).killed = true; // Already killed

        (driver as any).runningTasks.set(task.id, mockProc);

        await driver.interruptTask(task);
        assert.strictEqual((mockProc as any).kill.mock.callCount(), 0, "kill should NOT be called if already killed");
        assert.ok(!(driver as any).runningTasks.has(task.id), "Task should be removed from runningTasks");
    });

    it("executeTask creates workDir and fails properly if invalid command is executed", async () => {
        const task: Task = { id: 99, title: "Test Task", status: "todo", agentType: "build", agent: "Codex", category: "feature", priority: "alta", createdAt: Date.now() };
        const agent: Agent = { id: "codex-agent", name: "Codex", role: "Developer", tool: "codex" };

        const origPath = process.env.PATH;
        process.env.PATH = "";

        await driver.executeTask(task, agent, mockCtx);

        // Wait a little bit for the spawn ENOENT error to fire
        await new Promise(res => setTimeout(res, 50));

        process.env.PATH = origPath;

        assert.ok((mockCtx.onBugFound as any).mock.callCount() >= 1);
    });
});
