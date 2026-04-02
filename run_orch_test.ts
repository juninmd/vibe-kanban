import { spawn } from 'node:child_process';

const proc = spawn('tsx', ['--test', 'test/orchestration.test.ts'], {
  stdio: 'inherit'
});
