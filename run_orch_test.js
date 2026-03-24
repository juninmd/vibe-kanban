const { spawn } = require("child_process");

const proc = spawn("node", ["--test", "test/orchestration.test.js"], {
  stdio: "inherit",
});
