import {
  TerminalSession,
  TerminalSessionOptions,
  TerminalSessionInfo,
} from "./TerminalSession.js";

export interface TerminalManagerCallbacks {
  onOutput: (agentId: string, data: string) => void;
  onExit: (agentId: string, exitCode: number, signal?: number) => void;
}

export class TerminalManager {
  private sessions = new Map<string, TerminalSession>();
  private callbacks: TerminalManagerCallbacks;

  constructor(callbacks: TerminalManagerCallbacks) {
    this.callbacks = callbacks;
  }

  async create(options: TerminalSessionOptions): Promise<TerminalSessionInfo> {
    // Kill existing session for this agent if any
    if (this.sessions.has(options.agentId)) {
      await this.kill(options.agentId);
    }

    const session = new TerminalSession(options);

    session.on("data", (data: string) => {
      this.callbacks.onOutput(options.agentId, data);
    });

    session.on("exit", (exitCode: number, signal?: number) => {
      this.callbacks.onExit(options.agentId, exitCode, signal);
      this.sessions.delete(options.agentId);
    });

    this.sessions.set(options.agentId, session);

    const info = await session.spawn(
      options.cols ?? 120,
      options.rows ?? 30,
      options.env,
    );

    return info;
  }

  get(agentId: string): TerminalSession | undefined {
    return this.sessions.get(agentId);
  }

  write(agentId: string, data: string): void {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new Error(`No active terminal for agent ${agentId}`);
    }
    session.write(data);
  }

  resize(agentId: string, cols: number, rows: number): void {
    const session = this.sessions.get(agentId);
    if (!session) return;
    session.resize(cols, rows);
  }

  async kill(agentId: string): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) return;
    session.kill();
    this.sessions.delete(agentId);
  }

  listActive(): TerminalSessionInfo[] {
    const result: TerminalSessionInfo[] = [];
    for (const session of this.sessions.values()) {
      if (session.alive) {
        result.push(session.info());
      }
    }
    return result;
  }

  getBuffer(agentId: string): string {
    const session = this.sessions.get(agentId);
    if (!session) return "";
    return session.getBuffer();
  }

  isAlive(agentId: string): boolean {
    const session = this.sessions.get(agentId);
    return session?.alive ?? false;
  }

  async killAll(): Promise<void> {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      await this.kill(id);
    }
  }
}
