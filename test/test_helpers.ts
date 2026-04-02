import { setTimeout } from 'timers/promises';

export async function waitForServer(apiUrl: string): Promise<boolean> {
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

export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export interface FetchOptions extends Omit<RequestInit, 'body'> {
    body?: any;
}

export async function fetchJson<T = any>(url: string, options: FetchOptions = {}): Promise<T> {
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
        });
        const text = await res.text();
        return text ? JSON.parse(text) : {} as T;
    } catch (err: any) {
        if (err.cause?.code !== 'ECONNREFUSED' && err.code !== 'ECONNREFUSED') {
            console.error(err);
        }
        throw err;
    }
}
