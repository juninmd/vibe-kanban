import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getLaneSafe, getTaskCardPosition, shouldRenderTaskIn3D } from "../../dist/kanbanMath.js";

describe("kanbanMath", () => {
  test("fallback lane defaults to backlog", () => {
    assert.equal(getLaneSafe("unknown"), "backlog");
    assert.equal(getLaneSafe(undefined), "backlog");
  });

  test("returns deterministic card positions by lane and order", () => {
    assert.deepEqual(getTaskCardPosition("backlog", 0), { x: -4.5, y: 1.95 });
    assert.deepEqual(getTaskCardPosition("review", 2), { x: 1.5, y: 0.1499999999999999 });
  });

  test("respects visibility guardrails in 3D board", () => {
    assert.equal(shouldRenderTaskIn3D("done", 6, -1), false);
    assert.equal(shouldRenderTaskIn3D("review", 1, -2.3), false);
    assert.equal(shouldRenderTaskIn3D("in_progress", 1, 0.2), true);
  });
});
