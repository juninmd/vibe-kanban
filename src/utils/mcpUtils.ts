export interface MCPTool {
  name: string;
  description: string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export class MCPRegistry {
  private tools: Map<string, MCPTool> = new Map();

  registerTool(tool: MCPTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool with name ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): MCPTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): MCPTool[] {
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    try {
      return await tool.execute(args);
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new Error(`Error executing tool ${name}: ${err.message}`);
      }
      throw new Error(`Unknown error executing tool ${name}`);
    }
  }

  clear(): void {
    this.tools.clear();
  }
}

export const globalMCPRegistry = new MCPRegistry();
