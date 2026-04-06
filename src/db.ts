import Database from "better-sqlite3";
import { Task, Agent, EventLog } from "./types.js";

const db = new Database("vibe_kanban.db");

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    lane TEXT NOT NULL,
    assignedTo TEXT,
    interrupted BOOLEAN NOT NULL DEFAULT 0,
    logs TEXT NOT NULL DEFAULT '[]',
    githubRepo TEXT,
    description TEXT,
    agentType TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    workDir TEXT,
    dependencies TEXT DEFAULT '[]',
    groupId TEXT
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    model TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    assignedTask INTEGER,
    tool TEXT,
    terminalId TEXT
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    text TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS terminal_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    agentId TEXT NOT NULL,
    taskId INTEGER,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp INTEGER NOT NULL
  );
`);

// Migration: add workDir column if missing
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN workDir TEXT`);
} catch (e) { /* column already exists */ }

// Migration: add baseRepoDir column if missing
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN baseRepoDir TEXT`);
} catch (e) { /* column already exists */ }

// Migration: add dependencies column if missing
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN dependencies TEXT DEFAULT '[]'`);
} catch (e) { /* column already exists */ }

// Migration: add groupId column if missing
try {
  db.exec(`ALTER TABLE tasks ADD COLUMN groupId TEXT`);
} catch (e) { /* column already exists */ }

export const DB = {
  // Tasks
  getTasks(): Task[] {
    const rows = db.prepare("SELECT * FROM tasks ORDER BY createdAt DESC").all() as Record<string, unknown>[];
    return rows.map((row) => ({
      ...row,
      interrupted: !!row.interrupted,
      logs: JSON.parse(row.logs as string),
      dependencies: JSON.parse((row.dependencies as string) || '[]'),
      groupId: row.groupId as string | undefined
    })) as Task[];
  },

  getTask(id: number): Task | undefined {
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      ...row,
      interrupted: !!row.interrupted,
      logs: JSON.parse(row.logs as string),
      dependencies: JSON.parse((row.dependencies as string) || '[]'),
      groupId: row.groupId as string | undefined
    } as Task;
  },

  createTask(task: Partial<Task>): Task {
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO tasks (title, source, category, priority, lane, assignedTo, interrupted, logs, githubRepo, description, agentType, createdAt, updatedAt, workDir, baseRepoDir, dependencies, groupId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.title,
      task.source || "user",
      task.category || "misc",
      task.priority || "media",
      task.lane || "backlog",
      task.assignedTo || null,
      task.interrupted ? 1 : 0,
      JSON.stringify(task.logs || []),
      task.githubRepo || null,
      task.description || null,
      task.agentType || null,
      task.createdAt || now,
      task.updatedAt || now,
      task.workDir || null,
      task.baseRepoDir || null,
      JSON.stringify(task.dependencies || []),
      task.groupId || null
    );
    return this.getTask(Number(result.lastInsertRowid))!;
  },

  updateTask(id: number, updates: Partial<Task>): void {
    const task = this.getTask(id);
    if (!task) return;

    const updatedTask = { ...task, ...updates, updatedAt: Date.now() };
    db.prepare(`
      UPDATE tasks SET
        title = ?, source = ?, category = ?, priority = ?, lane = ?,
        assignedTo = ?, interrupted = ?, logs = ?, githubRepo = ?,
        description = ?, agentType = ?, updatedAt = ?, workDir = ?, baseRepoDir = ?, dependencies = ?, groupId = ?
      WHERE id = ?
    `).run(
      updatedTask.title,
      updatedTask.source,
      updatedTask.category,
      updatedTask.priority,
      updatedTask.lane,
      updatedTask.assignedTo,
      updatedTask.interrupted ? 1 : 0,
      JSON.stringify(updatedTask.logs),
      updatedTask.githubRepo,
      updatedTask.description,
      updatedTask.agentType,
      updatedTask.updatedAt,
      updatedTask.workDir || null,
      updatedTask.baseRepoDir || null,
      JSON.stringify(updatedTask.dependencies || []),
      updatedTask.groupId || null,
      id
    );
  },

  // Agents
  getAgents(): Agent[] {
    return db.prepare("SELECT * FROM agents").all() as Agent[];
  },

  getAgent(id: string): Agent | undefined {
    return db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Agent;
  },

  saveAgent(agent: Agent): void {
    db.prepare(`
      INSERT OR REPLACE INTO agents (id, role, model, category, status, assignedTask, tool, terminalId)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agent.id,
      agent.role,
      agent.model,
      agent.category,
      agent.status,
      agent.assignedTask,
      agent.tool,
      agent.terminalId
    );
  },

  updateAgent(id: string, updates: Partial<Agent>): void {
    const agent = this.getAgent(id);
    if (!agent) return;

    const updatedAgent = { ...agent, ...updates };
    this.saveAgent(updatedAgent);
  },

  // Events
  getEvents(limit = 50): EventLog[] {
    return db.prepare("SELECT timestamp, text FROM events ORDER BY id DESC LIMIT ?").all(limit) as EventLog[];
  },

  addEvent(timestamp: string, text: string): void {
    db.prepare("INSERT INTO events (timestamp, text) VALUES (?, ?)").run(timestamp, text);
  },

  deleteAgent(id: string): void {
    db.prepare("DELETE FROM agents WHERE id = ?").run(id);
    db.prepare("DELETE FROM terminal_logs WHERE agentId = ?").run(id);
  },

  // Terminal Logs
  addTerminalLog(agentId: string, taskId: number | null, type: string, content: string): void {
    db.prepare(
      "INSERT INTO terminal_logs (agentId, taskId, type, content, timestamp) VALUES (?, ?, ?, ?, ?)"
    ).run(agentId, taskId, type, content, Date.now());
  },

  getTerminalLogs(agentId: string, limit = 200): { type: string; content: string; timestamp: number; taskId: number | null }[] {
    return db.prepare(
      "SELECT type, content, timestamp, taskId FROM terminal_logs WHERE agentId = ? ORDER BY id DESC LIMIT ?"
    ).all(agentId, limit) as { type: string; content: string; timestamp: number; taskId: number | null }[];
  },

  getTaskTerminalLogs(taskId: number, limit = 500): { type: string; content: string; timestamp: number; agentId: string }[] {
    return db.prepare(
      "SELECT type, content, timestamp, agentId FROM terminal_logs WHERE taskId = ? ORDER BY id ASC LIMIT ?"
    ).all(taskId, limit) as { type: string; content: string; timestamp: number; agentId: string }[];
  },

  clearTerminalLogs(agentId: string): void {
    db.prepare("DELETE FROM terminal_logs WHERE agentId = ?").run(agentId);
  },

  clearDoneTasks(): void {
    db.prepare("DELETE FROM tasks WHERE lane = 'done'").run();
  },

  reset(): void {
    db.prepare("DELETE FROM tasks").run();
    db.prepare("DELETE FROM agents").run();
    db.prepare("DELETE FROM events").run();
    db.prepare("DELETE FROM terminal_logs").run();

    // Add default agents in test environment as well, so test passes
    const defaultAgents: Agent[] = [
      { id: `agent-pm`, role: "Product Manager", model: "gpt-4o", category: "roadmap", status: "idle", assignedTask: null, tool: "openai", terminalId: `term-pm` },
      { id: `agent-sec`, role: "Segurança", model: "gemini-1.5-flash", category: "security", status: "idle", assignedTask: null, tool: "gemini", terminalId: `term-sec` },
      { id: `agent-perf`, role: "Performance", model: "gpt-4o", category: "performance", status: "idle", assignedTask: null, tool: "copilot", terminalId: `term-perf` },
      { id: `agent-func`, role: "Novas Funcionalidades", model: "claude-3-5-sonnet-20241022", category: "feature", status: "idle", assignedTask: null, tool: "claude", terminalId: `term-func` },
      { id: `agent-test`, role: "Testes", model: "gpt-4o", category: "test", status: "idle", assignedTask: null, tool: "opencode", terminalId: `term-test` },
      { id: `agent-feat`, role: "Novas Features", model: "gpt-4o", category: "feature", status: "idle", assignedTask: null, tool: "opencode", terminalId: `term-feat` }
    ];
    for (const agent of defaultAgents) {
      this.saveAgent(agent);
    }
  }
};
