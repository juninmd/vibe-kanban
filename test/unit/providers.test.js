import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableTools } from '../../dist/providers.js';

describe('providers', () => {
  test('returns only available providers from custom registry', () => {
    const tools = getAvailableTools([
      { id: 'gemini', name: 'Gemini CLI', isAvailable: () => true },
      { id: 'openai', name: 'OpenAI API', isAvailable: () => false },
      { id: 'claude', name: 'Claude Code', isAvailable: () => true }
    ]);

    assert.deepEqual(tools, [
      { id: 'gemini', name: 'Gemini CLI' },
      { id: 'claude', name: 'Claude Code' }
    ]);
  });
});
