import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { getToolingLandscape } from '../../dist/utils/toolingLandscape.js'; // NOSONAR

describe('toolingLandscape', () => {
  test('returns tooling inventory, vcs capabilities and recommendations', () => {
    const landscape = getToolingLandscape();

    assert.equal(typeof landscape.detectedAt, 'string');
    assert.ok(Array.isArray(landscape.tools));
    assert.ok(Array.isArray(landscape.vcsProviders));
    assert.ok(Array.isArray(landscape.businessRecommendations));

    const toolIds = landscape.tools.map((tool) => tool.id);
    assert.ok(toolIds.includes('openai'));

    const providers = landscape.vcsProviders.map((provider) => provider.provider);
    assert.ok(providers.includes('github'));
    assert.ok(providers.includes('gitlab'));
  });
});
