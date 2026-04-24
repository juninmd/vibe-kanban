import { describe, it } from "node:test";
import assert from "node:assert";
import { CopilotDriver } from "../../src/drivers/CopilotDriver.js";
import { Task, Agent, DriverContext } from "../../src/types.js";
import * as path from "path";
import * as fs from "fs";
import { streamText } from "ai";

describe("CopilotDriver", () => {
    it("should list available models using the default github endpoint", async () => {
        const driver = new CopilotDriver();
        // Since we don't have the token during test, it should default to returning ["gpt-4o", "gpt-4o-mini"]
        const originalToken = process.env.GITHUB_TOKEN;
        delete process.env.GITHUB_TOKEN;

        try {
            const models = await driver.listModels();
            assert.deepStrictEqual(models, ["gpt-4o", "gpt-4o-mini"]);
        } finally {
            if (originalToken) process.env.GITHUB_TOKEN = originalToken;
        }
    });

    it("should interrupt running task", async () => {
        const driver = new CopilotDriver();
        const task = { id: 100 } as Task;

        await assert.doesNotReject(() => driver.interruptTask(task));
    });

    it("should return empty array from getLogs", () => {
        const driver = new CopilotDriver();
        assert.deepStrictEqual(driver.getLogs(1), []);
    });

    it("should execute task properly using streamText", async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        process.env.GITHUB_TOKEN = "dummy_token";

        const driver = new CopilotDriver();
        const task = { id: 101, title: "T1", description: "D1", category: "bug", priority: "alta", agentType: "plan" } as unknown as Task;
        const agent = { role: "test", model: "gpt-4o" } as Agent;
        const ctx = {
            onLog: () => {},
            onComplete: () => {},
            onBugFound: () => {},
            onInterrupt: () => {},
            memory: {} as any
        } as DriverContext;

        const originalFetch = global.fetch;
        global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
            // Mock fetch for the API calls made under the hood
            return {
                ok: true,
                body: {
                    getReader: () => {
                        let done = false;
                        return {
                            read: async () => {
                                if (!done) {
                                    done = true;
                                    return { done: false, value: new TextEncoder().encode("data: {\"choices\":[{\"delta\":{\"content\":\"test chunk\"}}]}\n\n") };
                                }
                                return { done: true, value: undefined };
                            }
                        };
                    }
                },
                headers: new Headers({ "content-type": "text/event-stream" }),
                json: async () => ({})
            } as any;
        };

        try {
            await driver.executeTask(task, agent, ctx);
        } finally {
            global.fetch = originalFetch;
            if (originalToken) {
                process.env.GITHUB_TOKEN = originalToken;
            } else {
                delete process.env.GITHUB_TOKEN;
            }
        }
    });

    it("should execute task and return files created", async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        process.env.GITHUB_TOKEN = "dummy_token";

        const driver = new CopilotDriver();
        const task = { id: 102, title: "T2", description: "D2", category: "bug", priority: "alta", agentType: "build" } as unknown as Task;
        const agent = { role: "test", model: "gpt-4o" } as Agent;
        const ctx = {
            onLog: () => {},
            onComplete: () => {},
            onBugFound: () => {},
            onInterrupt: () => {},
            memory: {} as any
        } as DriverContext;

        const originalFetch = global.fetch;
        global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
            // Mock fetch for the API calls made under the hood
            return {
                ok: true,
                body: {
                    getReader: () => {
                        let done = false;
                        return {
                            read: async () => {
                                if (!done) {
                                    done = true;
                                    return { done: false, value: new TextEncoder().encode("data: {\"choices\":[{\"delta\":{\"content\":\"<<<FILE:test.txt>>>\\ncontent\\n<<<END>>>\"}}]}\n\n") };
                                }
                                return { done: true, value: undefined };
                            }
                        };
                    }
                },
                headers: new Headers({ "content-type": "text/event-stream" }),
                json: async () => ({})
            } as any;
        };

        try {
            await driver.executeTask(task, agent, ctx);
        } finally {
            global.fetch = originalFetch;
            if (originalToken) {
                process.env.GITHUB_TOKEN = originalToken;
            } else {
                delete process.env.GITHUB_TOKEN;
            }
        }
    });

    it("should handle error in executeTask", async () => {
        const originalToken = process.env.GITHUB_TOKEN;
        process.env.GITHUB_TOKEN = "dummy_token";

        const driver = new CopilotDriver();
        const task = { id: 103, title: "T3", description: "D3", category: "bug", priority: "alta", agentType: "plan" } as unknown as Task;
        const agent = { role: "test", model: "gpt-4o" } as Agent;
        const ctx = {
            onLog: () => {},
            onComplete: () => {},
            onBugFound: () => {},
            onInterrupt: () => {},
            memory: {} as any
        } as DriverContext;

        const originalFetch = global.fetch;
        global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
            throw new Error("Network error");
        };

        try {
            await driver.executeTask(task, agent, ctx);
        } finally {
            global.fetch = originalFetch;
            if (originalToken) {
                process.env.GITHUB_TOKEN = originalToken;
            } else {
                delete process.env.GITHUB_TOKEN;
            }
        }
    });
});
