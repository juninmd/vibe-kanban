export class Memory {
  private static instance: Memory;
  private store: Map<string, unknown>;

  private constructor() {
    this.store = new Map();
  }

  public static getInstance(): Memory {
    if (!Memory.instance) {
      Memory.instance = new Memory();
    }
    return Memory.instance;
  }

  public get(key: string): unknown {
    return this.store.get(key);
  }

  public set(key: string, value: unknown): void {
    this.store.set(key, value);
  }

  public getAll(): Record<string, unknown> {
    return Object.fromEntries(this.store);
  }

  public clear(): void {
    this.store.clear();
  }
}
