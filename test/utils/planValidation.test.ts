import { test, describe } from "node:test";
import * as assert from "node:assert";
import { buildExecutionWaves, GeneratedTask } from "../../src/utils/planValidation.js";

describe("planValidation - buildExecutionWaves", () => {
  test("creates separate waves for a linear chain (1->2->3)", () => {
    const tasks: GeneratedTask[] = [
      { order: 1, dependsOn: [] },
      { order: 2, dependsOn: [1] },
      { order: 3, dependsOn: [2] },
    ];
    const waves = buildExecutionWaves(tasks);
    assert.strictEqual(waves.length, 3);
    assert.deepStrictEqual(waves[0].map(t => t.order), [1]);
    assert.deepStrictEqual(waves[1].map(t => t.order), [2]);
    assert.deepStrictEqual(waves[2].map(t => t.order), [3]);
  });

  test("handles parallel dependencies", () => {
    const tasks: GeneratedTask[] = [
      { order: 1, dependsOn: [] },
      { order: 2, dependsOn: [] },
      { order: 3, dependsOn: [1, 2] },
      { order: 4, dependsOn: [3] },
    ];
    const waves = buildExecutionWaves(tasks);
    assert.strictEqual(waves.length, 3);
    assert.deepStrictEqual(waves[0].map(t => t.order), [1, 2]);
    assert.deepStrictEqual(waves[1].map(t => t.order), [3]);
    assert.deepStrictEqual(waves[2].map(t => t.order), [4]);
  });

  test("breaks out defensively on cycles", () => {
    const tasks: GeneratedTask[] = [
      { order: 1, dependsOn: [2] },
      { order: 2, dependsOn: [1] },
    ];
    const waves = buildExecutionWaves(tasks);
    assert.strictEqual(waves.length, 1);
    assert.deepStrictEqual(waves[0].map(t => t.order), [1, 2]);
  });

  test("handles cycles mid-wave correctly", () => {
    const tasks: GeneratedTask[] = [
      { order: 1, dependsOn: [] },
      { order: 2, dependsOn: [1, 3] },
      { order: 3, dependsOn: [2] },
    ];
    const waves = buildExecutionWaves(tasks);
    assert.strictEqual(waves.length, 2);
    assert.deepStrictEqual(waves[0].map(t => t.order), [1]);
    assert.deepStrictEqual(waves[1].map(t => t.order), [2, 3]);
  });

  test("handles empty inputs", () => {
    const waves = buildExecutionWaves([]);
    assert.strictEqual(waves.length, 0);
  });
});
