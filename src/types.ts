export interface Task {
  id: number;
  title: string;
  source: string;
  category: string;
  priority: "alta" | "media" | "baixa";
  lane: "backlog" | "in_progress" | "review" | "done";
  assignedTo: string | null;
  interrupted: boolean;
  logs: string[];
  githubRepo?: string;
  description?: string;
  agentType?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Agent {
  id: string;
  role: string;
  model: string;
  category: string;
  status: "idle" | "working";
  assignedTask: number | null;
  tool?: string;
  terminalId?: string;
}

export interface EventLog {
  timestamp: string;
  text: string;
}

export interface State {
  tasks: Task[];
  agents: Agent[];
  events: EventLog[];
}

export interface DriverContext {
  onLog: (taskId: number, message: string) => void;
  onComplete: (taskId: number) => void;
  onBugFound: (taskId: number, description: string) => void;
  onInterrupt: (taskId: number) => void;
}

export interface LLMDriver {
  name: string;
  executeTask(task: Task, agent: Agent, ctx: DriverContext): Promise<void>;
  interruptTask(task: Task): Promise<void>;
  getLogs(taskId: number): string[];
}
