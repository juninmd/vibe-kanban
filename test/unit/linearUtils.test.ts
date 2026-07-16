import { test, suite } from 'node:test';
import assert from 'node:assert';
import { fetchLinearIssues } from '../../src/utils/linearUtils.js';

suite('linearUtils', () => {
    test('returns empty array if apiKey is missing', async () => {
        const issues = await fetchLinearIssues('');
        assert.deepEqual(issues, []);
    });

    test('returns issues on successful fetch', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => {
            global.fetch = originalFetch;
        });

        global.fetch = async (url, options) => {
            return {
                ok: true,
                json: async () => ({
                    data: {
                        issues: {
                            nodes: [
                                {
                                    id: '123',
                                    title: 'Linear Task 1',
                                    description: 'Test description',
                                    priority: 1,
                                    url: 'https://linear.app/issue/123'
                                }
                            ]
                        }
                    }
                })
            } as Response;
        };

        const issues = await fetchLinearIssues('fake-key');
        assert.equal(issues.length, 1);
        assert.equal(issues[0].title, 'Linear Task 1');
    });

    test('returns empty array if fetch fails (res.ok is false)', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => {
            global.fetch = originalFetch;
        });

        global.fetch = async () => {
            return {
                ok: false,
                status: 500
            } as Response;
        };

        const issues = await fetchLinearIssues('fake-key');
        assert.deepEqual(issues, []);
    });

    test('returns empty array if fetch throws an error', async (t) => {
        const originalFetch = global.fetch;
        t.after(() => {
            global.fetch = originalFetch;
        });

        global.fetch = async () => {
            throw new Error('Network error');
        };

        const issues = await fetchLinearIssues('fake-key');
        assert.deepEqual(issues, []);
    });
});
