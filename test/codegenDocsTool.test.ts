import { test } from 'node:test';
import * as assert from 'node:assert';
import { globalMCPRegistry } from '../src/utils/mcpUtils.js';
import '../src/utils/codegenDocsTool.js';

test('codegenDocsTool', async (t) => {
    // Save original fetch
    const originalFetch = global.fetch;

    await t.test('fetch_codegen_docs tool is registered', () => {
        const tool = globalMCPRegistry.getTool('fetch_codegen_docs');
        assert.ok(tool);
    });

    await t.test('fetch_codegen_docs MCP tool executes successfully', async () => {
        global.fetch = (async () => {
            return {
                ok: true,
                text: async () => '<html><body>Docs <b>test</b> content</body><script>alert("no")</script></html>'
            };
        }) as any;

        const result = await globalMCPRegistry.executeTool('fetch_codegen_docs', {});
        assert.strictEqual(typeof result, 'string');
        assert.ok((result as string).includes('Docs test content'));
        assert.ok(!(result as string).includes('alert("no")'));
    });

    await t.test('fetch_codegen_docs handles fetch errors', async () => {
        global.fetch = (async () => {
            return {
                ok: false,
                status: 404,
                text: async () => 'Not found'
            };
        }) as any;

        const result = await globalMCPRegistry.executeTool('fetch_codegen_docs', {});
        assert.strictEqual(result, 'Failed to fetch docs');
    });

    // Restore fetch
    global.fetch = originalFetch;
});
