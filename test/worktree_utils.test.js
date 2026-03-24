import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeGithubRepo,
  getGithubRepoName,
  buildGithubRemoteUrl,
} from "../dist/utils/worktreeUtils.js";

describe("worktreeUtils", () => {
  test("normalizes GitHub URLs and preserves repo naming", () => {
    assert.equal(
      normalizeGithubRepo("https://github.com/juninmd/cobaia"),
      "juninmd/cobaia",
    );
    assert.equal(normalizeGithubRepo("juninmd/cobaia"), "juninmd/cobaia");
    assert.equal(
      normalizeGithubRepo("git@github.com:juninmd/cobaia.git"),
      "juninmd/cobaia",
    );
    assert.equal(
      getGithubRepoName("https://github.com/juninmd/cobaia"),
      "cobaia",
    );
  });

  test("builds remote URLs from normalized repos", () => {
    assert.equal(
      buildGithubRemoteUrl("https://github.com/juninmd/cobaia"),
      "https://github.com/juninmd/cobaia.git",
    );
    assert.equal(
      buildGithubRemoteUrl("juninmd/cobaia", "token123"),
      "https://oauth2:token123@github.com/juninmd/cobaia.git",
    );
  });
});
