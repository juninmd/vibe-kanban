import re
with open('test/unit/GeminiDriver.test.ts', 'r') as f:
    data = f.read()

import_ai = 'import * as aiSdk from "ai";\nimport * as providerSdk from "ai-sdk-provider-gemini-cli";\nimport * as fs from "fs";\n'

test_case = '''
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

        // We override createGeminiProvider so that the real library logic isn't triggered
        mock.method(providerSdk, "createGeminiProvider", () => {
            return (modelId: string) => ({ id: modelId, call: async () => {} });
        });

        const mockStreamText = async (options: any) => {
            return {
                textStream: (async function* () {
                    yield "chunk 1\\n";
                    yield "chunk 2\\n";
                })()
            };
        };
        mock.method(aiSdk, "streamText", mockStreamText);

        await driver.executeTask(task, agent, mockCtx);

        const logs = (mockCtx.onLog as any).mock.calls.map((c: any) => c.arguments[1]);
        assert.ok(logs.some((msg: string) => msg.includes("chunk 1")), "Should log chunk 1");
        assert.ok(logs.some((msg: string) => msg.includes("chunk 2")), "Should log chunk 2");
        assert.ok(logs.some((msg: string) => msg.includes("Task completed. Files created:")), "Should log completion");

        assert.strictEqual((mockCtx.onComplete as any).mock.callCount(), 1);
        assert.ok(fs.existsSync(task.workDir!), "Should create workdir");
    });
'''

data = data.replace('import { Task, Agent, DriverContext } from "../../src/types.js";', 'import { Task, Agent, DriverContext } from "../../src/types.js";\n' + import_ai)
data = data.replace('    it("should return empty array from getLogs", () => {', test_case + '\n    it("should return empty array from getLogs", () => {')

with open('test/unit/GeminiDriver.test.ts', 'w') as f:
    f.write(data)
