import { spawn, ChildProcess } from 'node:child_process';
import { setTimeout } from 'timers/promises';

export const API_URL = 'http://localhost:5174'; // NOSONAR

export async function waitForServer() {
  for (let attempts = 0; attempts < 30; attempts++) {
    try {
      const res = await fetch(`${API_URL}/api/state`);
      if (res.ok) return true;
    } catch {
      // retry
    }
    await setTimeout(300);
  }
  return false;
}

export async function startTestServer(): Promise<ChildProcess> {
  const serverProcess = spawn('node', ['dist/server.js'], { // NOSONAR
    stdio: 'pipe',
    env: { ...process.env, PORT: '5174' }
  });

  const ready = await waitForServer();
  if (!ready) {
    serverProcess.kill();
    throw new Error('Server failed to start');
  }

  return serverProcess;
}
