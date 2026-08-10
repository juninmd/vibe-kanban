import { test } from 'node:test';
import * as assert from 'node:assert';
import { searchWeb } from '../src/utils/webSearchUtils.js';
import { globalMCPRegistry } from '../src/utils/mcpUtils.js';
import fetch from 'node-fetch';

test('webSearchUtils', async (t) => {
    // Save original fetch
    const originalFetch = global.fetch;

    await t.test('searchWeb returns successfully', async () => {
        global.fetch = (async (url: string) => {
            if (url.includes('duckduckgo.com')) {
                return {
                    ok: true,
                    text: async () => '<html><body>Hello World!</body></html>'
                };
            }
            return { ok: false };
        }) as any;

        const result = await searchWeb('test query');
        assert.strictEqual(result, 'Hello World!');
    });

    await t.test('searchWeb handles HTTP errors', async () => {
        global.fetch = (async (url: string) => {
            return {
                ok: false,
                status: 404,
                text: async () => 'Not found'
            };
        }) as any;

        await assert.rejects(async () => {
            await searchWeb('test query');
        }, /Web search failed with status: 404/);
    });

    await t.test('searchWeb handles fetch exceptions', async () => {
        global.fetch = (async () => {
            throw new Error('Network error');
        }) as any;

        await assert.rejects(async () => {
            await searchWeb('test query');
        }, /Web search error: Network error/);
    });

    await t.test('searchWeb handles unknown exceptions', async () => {
        global.fetch = (async () => {
            throw 'string error';
        }) as any;

        await assert.rejects(async () => {
            await searchWeb('test query');
        }, /Unknown web search error/);
    });

    await t.test('web_search MCP tool executes successfully', async () => {
        global.fetch = (async () => {
            return {
                ok: true,
                text: async () => '<b>MCP test result</b>'
            };
        }) as any;

        const result = await globalMCPRegistry.executeTool('web_search', { query: 'test' });
        assert.strictEqual(result, 'MCP test result');
    });

    await t.test('web_search MCP tool throws on missing query', async () => {
        await assert.rejects(async () => {
            await globalMCPRegistry.executeTool('web_search', {});
        }, /Missing or invalid argument: query/);
    });

    // Restore fetch
    global.fetch = originalFetch;
});

test('MCPRegistry', async (t) => {
    const { MCPRegistry } = await import('../src/utils/mcpUtils.js');
    const registry = new MCPRegistry();

    await t.test('registerTool throws if already registered', () => {
        registry.registerTool({ name: 'test_tool', description: 'desc', execute: async () => 'result' });
        assert.throws(() => {
            registry.registerTool({ name: 'test_tool', description: 'desc', execute: async () => 'result' });
        }, /Tool with name test_tool is already registered/);
    });

    await t.test('getTool returns undefined if not found', () => {
        assert.strictEqual(registry.getTool('not_exist'), undefined);
    });

    await t.test('executeTool throws if not found', async () => {
        await assert.rejects(async () => {
            await registry.executeTool('not_exist', {});
        }, /Tool not found: not_exist/);
    });

    await t.test('executeTool throws unknown error if tool throws non-Error', async () => {
        registry.registerTool({
            name: 'throw_string',
            description: 'desc',
            execute: async () => { throw 'string error'; }
        });
        await assert.rejects(async () => {
            await registry.executeTool('throw_string', {});
        }, /Unknown error executing tool throw_string/);
    });

    await t.test('clear removes all tools', () => {
        registry.clear();
        assert.strictEqual(registry.getAllTools().length, 0);
    });
});
