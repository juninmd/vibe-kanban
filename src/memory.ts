export class Memory {
  private static instance: Memory;
  private store: Map<string, any>;

  private constructor() {
    this.store = new Map();
  }

  public static getInstance(): Memory {
    if (!Memory.instance) {
      Memory.instance = new Memory();
    }
    return Memory.instance;
  }

  public get(key: string): any {
    return this.store.get(key);
  }

  public set(key: string, value: any): void {
    this.store.set(key, value);
  }

  public getAll(): Record<string, any> {
    return Object.fromEntries(this.store);
  }

  public clear(): void {
    this.store.clear();
  }
}
