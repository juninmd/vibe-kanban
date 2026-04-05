import { EventEmitter } from "events";
import * as os from "os";
import * as path from "path";

// node-pty types
interface IPty {
    pid: number;
    cols: number;
    rows: number;
    onData: (callback: (data: string) => void) => { dispose: () => void };
    onExit: (callback: (e: { exitCode: number; signal?: number }) => void) => { dispose: () => void };
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    kill: (signal?: string) => void;
}

interface IPtySpawnOptions {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
}

export interface TerminalSessionOptions {
    agentId: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string>;
    shell?: string;
}

export interface TerminalSessionInfo {
    agentId: string;
    pid: number;
    cols: number;
    rows: number;
    cwd: string;
    shell: string;
    alive: boolean;
    createdAt: number;
}

const BUFFER_MAX = 50_000; // chars

function detectShell(): string {
    const platform = process.platform;
    if (platform === "win32") {
        return process.env.COMSPEC || "powershell.exe";
    }
    return process.env.SHELL || "/bin/bash";
}

function defaultCwd(): string {
    return process.cwd();
}

export class TerminalSession extends EventEmitter {
    readonly agentId: string;
    readonly shell: string;
    readonly cwd: string;
    readonly createdAt: number;

    private pty: IPty | null = null;
    private buffer: string = "";
    private _alive: boolean = false;
    private disposables: Array<{ dispose: () => void }> = [];

    constructor(options: TerminalSessionOptions) {
        super();
        this.agentId = options.agentId;
        this.shell = options.shell || detectShell();
        this.cwd = options.cwd || defaultCwd();
        this.createdAt = Date.now();
    }

    async spawn(cols = 120, rows = 30, env?: Record<string, string>): Promise<TerminalSessionInfo> {
        if (this._alive) {
            throw new Error(`Terminal for agent ${this.agentId} is already running`);
        }

        // Dynamic import of node-pty (native module)
        const nodePty = await import("node-pty");
        const spawnFn = nodePty.spawn || (nodePty as unknown as { default?: { spawn?: typeof nodePty.spawn } }).default?.spawn;

        if (!spawnFn) {
            throw new Error("node-pty spawn function not found");
        }

        const shellArgs = this.getShellArgs();

        const ptyProcess: IPty = spawnFn(this.shell, shellArgs, {
            name: "xterm-256color",
            cols,
            rows,
            cwd: this.cwd,
            env: { ...process.env, ...env } as Record<string, string>,
        });

        this.pty = ptyProcess;
        this._alive = true;

        // Listen to data
        const dataDisp = ptyProcess.onData((data: string) => {
            this.appendBuffer(data);
            this.emit("data", data);
        });
        this.disposables.push(dataDisp);

        // Listen to exit
        const exitDisp = ptyProcess.onExit((e) => {
            this._alive = false;
            this.emit("exit", e.exitCode, e.signal);
            this.cleanup();
        });
        this.disposables.push(exitDisp);

        return this.info();
    }

    private getShellArgs(): string[] {
        const platform = process.platform;
        if (platform === "win32") {
            if (this.shell.toLowerCase().includes("powershell")) {
                return ["-NoLogo"];
            }
            return [];
        }
        // Linux/macOS: login shell
        return ["-l"];
    }

    write(data: string): void {
        if (!this.pty || !this._alive) {
            throw new Error(`Terminal for agent ${this.agentId} is not running`);
        }
        this.pty.write(data);
    }

    resize(cols: number, rows: number): void {
        if (!this.pty || !this._alive) return;
        this.pty.resize(cols, rows);
    }

    kill(): void {
        if (!this.pty) return;
        try {
            this.pty.kill();
        } catch {
            // Already dead
        }
        this._alive = false;
        this.cleanup();
    }

    get alive(): boolean {
        return this._alive;
    }

    get pid(): number {
        return this.pty?.pid ?? -1;
    }

    getBuffer(): string {
        return this.buffer;
    }

    info(): TerminalSessionInfo {
        return {
            agentId: this.agentId,
            pid: this.pid,
            cols: this.pty?.cols ?? 120,
            rows: this.pty?.rows ?? 30,
            cwd: this.cwd,
            shell: this.shell,
            alive: this._alive,
            createdAt: this.createdAt,
        };
    }

    private appendBuffer(data: string): void {
        this.buffer += data;
        if (this.buffer.length > BUFFER_MAX) {
            this.buffer = this.buffer.slice(-BUFFER_MAX);
        }
    }

    private cleanup(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch { }
        }
        this.disposables = [];
        this.pty = null;
    }
}
