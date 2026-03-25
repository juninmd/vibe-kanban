import { setTimeout } from 'timers/promises';

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
