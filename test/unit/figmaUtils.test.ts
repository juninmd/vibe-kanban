import test from "node:test";
import assert from "node:assert";
import { fetchFigmaComments } from "../../src/utils/figmaUtils.js";

test("fetchFigmaComments successfully returns comments", async () => {
  const mockComments = [
    { id: "1", message: "Make it pop", user: { handle: "designer" } }
  ];

  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.strictEqual(url, "https://api.figma.com/v1/files/test-file/comments");
    assert.strictEqual((options?.headers as any)["X-Figma-Token"], "test-token");
    return {
      ok: true,
      json: async () => ({ comments: mockComments })
    } as Response;
  };

  try {
    const comments = await fetchFigmaComments("test-file", "test-token");
    assert.deepStrictEqual(comments, mockComments);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchFigmaComments returns empty array if comments is undefined", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return {
      ok: true,
      json: async () => ({})
    } as Response;
  };

  try {
    const comments = await fetchFigmaComments("test-file", "test-token");
    assert.deepStrictEqual(comments, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchFigmaComments throws error when response is not ok", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    return {
      ok: false,
      statusText: "Forbidden"
    } as Response;
  };

  try {
    await assert.rejects(
      fetchFigmaComments("test-file", "test-token"),
      /Figma API error: Forbidden/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
