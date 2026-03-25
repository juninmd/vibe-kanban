import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { enrichDemand } from '../../dist/utils/demandIntake.js';

describe('demandIntake', () => {
  test('enriches demand and detects gitlab provider', () => {
    const intake = enrichDemand({
      title: 'Melhorar segurança do SaaS',
      description: 'Precisamos de reforço de segurança para multi-tenant',
      repoUrl: 'https://gitlab.com/acme/platform'
    });

    assert.equal(intake.demand.provider, 'gitlab');
    assert.ok(intake.executionPlan.length >= 3);
    assert.ok(intake.businessRequirements.some((item: string) => item.toLowerCase().includes('multi-tenant')));
    assert.ok(intake.acceptanceCriteria.some((item: string) => item.includes('GitHub/GitLab')));
  });
});
