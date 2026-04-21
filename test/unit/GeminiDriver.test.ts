import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { GeminiDriver } from "../../src/drivers/GeminiDriver.js";
import { Task, Agent, DriverContext } from "../../src/types.js";
import * as fs from "fs";


describe("GeminiDriver", () => {
    let mockCtx: DriverContext;
    const getCloneDir = () => "/tmp/mock-clone-dir-" + Date.now();
    let driver: GeminiDriver;

    beforeEach(() => {
        mockCtx = {
            onLog: mock.fn(),
            onComplete: mock.fn(),
            onBugFound: mock.fn(),
            onInterrupt: mock.fn(),
            memory: {} as any
        };
        driver = new GeminiDriver(getCloneDir);
    });

    afterEach(() => {
        mock.restoreAll();
    });

    it("should instantiate with expected name", () => {
        assert.strictEqual(driver.name, "Gemini CLI Driver");
    });

    it("should list models and handle API requests", async () => {
        const originalEnv = { ...process.env };
        process.env.GEMINI_API_KEY = "test-api-key";

        mock.method(globalThis, "fetch", async (url: string) => {
            if (url.includes("generativelanguage.googleapis.com/v1beta/models")) {
                return {
                    ok: true,
                    json: async () => ({
                        models: [{ name: "gemini-1.5-pro" }, { name: "gemini-2.5-pro" }]
                    })
                };
            }
            return { ok: false };
        });

        const models = await driver.listModels();
        assert.deepStrictEqual(models, ["gemini-1.5-pro", "gemini-2.5-pro"]);

        process.env = originalEnv;
    });

    it("should return empty array if GEMINI_API_KEY is missing", async () => {
        const originalEnv = { ...process.env };
        delete process.env.GEMINI_API_KEY;

        const models = await driver.listModels();
        assert.deepStrictEqual(models, []);

        process.env = originalEnv;
    });


    it("should execute task and create workdir via streamText (mocked)", async () => {
        const task: Task = {
            id: 99,
            title: "Test Task",
            description: "Do something",
            status: "todo",
            agent: "Gemini",
            agentType: "build",
            category: "feature",
            priority: "alta",
            createdAt: Date.now(),
            workDir: "/tmp/mock-workdir-" + Date.now()
        };

        const agent: Agent = {
            id: "gemini-agent",
            name: "Gemini",
            role: "Developer",
            tool: "gemini"
        };


        // The real executeTask calls ai sdk which tries to do network requests or fails if api key is invalid.
        // We will just verify it creates workDir.
        try {

            const originalEnv = { ...process.env };
            process.env.GEMINI_API_KEY = "invalid"; // Should cause exception which is caught
            await driver.executeTask(task, agent, mockCtx);
            process.env = originalEnv;
        } catch (e) {
            // Expected error during mocked execution
        }



        assert.ok(fs.existsSync(task.workDir!), "Should create workdir");
    });

    it("should return empty array from getLogs", () => {
        const logs = driver.getLogs(1);
        assert.deepStrictEqual(logs, []);
    });

    it("should interrupt running task", async () => {
        const task: Task = {
            id: 42,
            title: "Test Task",
            status: "todo",
            agentType: "build",
            agent: "Gemini",
            category: "feature",
            priority: "alta",
            createdAt: Date.now()
        };

        const agent: Agent = {
            id: "gemini-agent",
            name: "Gemini",
            role: "Developer",
            tool: "gemini"
        };

        // Create a fake abort controller and map it to running tasks
        const abortController = new AbortController();
        const abortSpy = mock.method(abortController, "abort", () => {});
        (driver as any).runningTasks.set(task.id, abortController);

        await driver.interruptTask(task);
        assert.strictEqual(abortSpy.mock.callCount(), 1, "Abort controller should be called");
        assert.ok(!(driver as any).runningTasks.has(task.id), "Task should be removed from runningTasks");
    });
});
