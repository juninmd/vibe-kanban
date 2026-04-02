import { spawn } from 'child_process';

const proc = spawn('tsx', ['--test', 'test/orchestration.test.ts'], {
  stdio: 'inherit'
});
