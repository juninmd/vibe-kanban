import test from 'node:test';
import assert from 'node:assert';
import { MCPRegistry, MCPTool, globalMCPRegistry } from '../../src/utils/mcpUtils.js';

test('MCPRegistry operations', async (t) => {
  await t.test('should register and retrieve a tool', () => {
    const registry = new MCPRegistry();
    const tool: MCPTool = {
      name: 'testTool',
      description: 'A test tool',
      execute: async () => 'success',
    };

    registry.registerTool(tool);

    const retrieved = registry.getTool('testTool');
    assert.strictEqual(retrieved?.name, 'testTool');
    assert.strictEqual(retrieved?.description, 'A test tool');
  });

  await t.test('should return all tools', () => {
    const registry = new MCPRegistry();
    const tool1: MCPTool = { name: 'tool1', description: 'desc1', execute: async () => {} };
    const tool2: MCPTool = { name: 'tool2', description: 'desc2', execute: async () => {} };

    registry.registerTool(tool1);
    registry.registerTool(tool2);

    const tools = registry.getAllTools();
    assert.strictEqual(tools.length, 2);
    assert.ok(tools.find(t => t.name === 'tool1'));
    assert.ok(tools.find(t => t.name === 'tool2'));
  });

  await t.test('should throw error when registering a tool with the same name', () => {
    const registry = new MCPRegistry();
    const tool: MCPTool = { name: 'testTool', description: 'desc', execute: async () => {} };
    registry.registerTool(tool);

    assert.throws(
      () => registry.registerTool(tool),
      { message: 'Tool with name testTool is already registered' }
    );
  });

  await t.test('should execute a tool successfully', async () => {
    const registry = new MCPRegistry();
    const tool: MCPTool = {
      name: 'add',
      description: 'Adds two numbers',
      execute: async (args) => {
        const a = args.a as number;
        const b = args.b as number;
        return a + b;
      },
    };
    registry.registerTool(tool);

    const result = await registry.executeTool('add', { a: 5, b: 10 });
    assert.strictEqual(result, 15);
  });

  await t.test('should throw error when executing a non-existent tool', async () => {
    const registry = new MCPRegistry();
    await assert.rejects(
      async () => registry.executeTool('missingTool', {}),
      { message: 'Tool not found: missingTool' }
    );
  });

  await t.test('should handle Error instances thrown by tool execution', async () => {
    const registry = new MCPRegistry();
    const failingTool: MCPTool = {
      name: 'failingTool',
      description: 'Fails',
      execute: async () => {
        throw new Error('Internal tool error');
      },
    };
    registry.registerTool(failingTool);

    await assert.rejects(
      async () => registry.executeTool('failingTool', {}),
      { message: 'Error executing tool failingTool: Internal tool error' }
    );
  });

  await t.test('should handle unknown errors thrown by tool execution', async () => {
    const registry = new MCPRegistry();
    const failingTool: MCPTool = {
      name: 'failingToolUnknown',
      description: 'Fails unknown',
      execute: async () => {
        throw 'String error';
      },
    };
    registry.registerTool(failingTool);

    await assert.rejects(
      async () => registry.executeTool('failingToolUnknown', {}),
      { message: 'Unknown error executing tool failingToolUnknown' }
    );
  });

  await t.test('should clear all tools', () => {
    const registry = new MCPRegistry();
    const tool: MCPTool = { name: 'testTool', description: 'desc', execute: async () => {} };
    registry.registerTool(tool);

    assert.strictEqual(registry.getAllTools().length, 1);
    registry.clear();
    assert.strictEqual(registry.getAllTools().length, 0);
  });

  await t.test('global MCPRegistry should be instantiated', () => {
    assert.ok(globalMCPRegistry instanceof MCPRegistry);
  });
});
