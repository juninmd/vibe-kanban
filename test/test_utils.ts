import { setTimeout } from 'timers/promises';
import { spawn, ChildProcess } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

export async function waitForServer(apiUrl: string) {
  for (let attempts = 0; attempts < 30; attempts++) {
    try {
      const res = await fetch(`${apiUrl}/api/state`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await setTimeout(300);
  }
  return false;
}

export async function startTestServer(apiUrl: string): Promise<ChildProcess> {
  const serverProcess = spawn('node', ['dist/server.js'], {
    stdio: 'pipe',
    env: { ...process.env, PORT: '5174' }
  });

  const ready = await waitForServer(apiUrl);
  if (!ready) {
    serverProcess.kill();
    throw new Error('Server failed to start');
  }

  return serverProcess;
}

export function stopTestServer(serverProcess: ChildProcess | undefined) {
  const cloneDir = './test-clones';
  if (existsSync(cloneDir)) rmSync(cloneDir, { recursive: true, force: true });
  if (serverProcess) serverProcess.kill();
}
