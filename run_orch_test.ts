import { spawn } from 'child_process';

const proc = spawn('node', ['--import', 'tsx', '--test', 'test/orchestration.test.ts'], {
  stdio: 'inherit'
});
