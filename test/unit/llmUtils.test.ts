import { describe, it, mock, afterEach, beforeEach } from "node:test";
import assert from "node:assert";
import * as llmUtilsModule from "../../src/utils/llmUtils.js";

// Test suite for LLM utility, due to missing 'mock.module' in Node 22 native test runner
// and complex validation internal to Vercel AI SDK on native mock endpoints,
// we ensure the error paths and basic initializations work gracefully.

describe("llmUtils", () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("should return undefined if no API key is set", async () => {
    const result = await llmUtilsModule.callLLM("test prompt");
    assert.strictEqual(result, undefined);
  });

  it("should attempt OpenAI request if OPENAI_API_KEY is set (and handle authentication error)", async () => {
    process.env.OPENAI_API_KEY = "test_key";

    const originalConsoleError = console.error;
    let consoleErrorOutput = "";
    console.error = (msg: string) => { consoleErrorOutput = msg; };

    const result = await llmUtilsModule.callLLM("test prompt");

    console.error = originalConsoleError;

    assert.strictEqual(result, undefined);
    assert.ok(consoleErrorOutput.startsWith("LLM call failed:"));
  });

  it("should attempt Gemini request if GEMINI_API_KEY is set (and handle authentication error)", async () => {
    process.env.GEMINI_API_KEY = "test_key";

    const originalConsoleError = console.error;
    let consoleErrorOutput = "";
    console.error = (msg: string) => { consoleErrorOutput = msg; };

    const result = await llmUtilsModule.callLLM("test prompt");

    console.error = originalConsoleError;

    assert.strictEqual(result, undefined);
    assert.ok(consoleErrorOutput.startsWith("LLM call failed:"));
  });
});
