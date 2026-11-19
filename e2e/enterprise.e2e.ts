import { describe, expect, it } from 'vitest';
import { Sandbox, readSkill } from './sandbox.ts';

describe('real enterprise GitHub fixture (explicit opt-in)', () => {
  it('clones, installs, checks and removes the configured corporate Skill', async () => {
    const source = process.env.SKILLS_E2E_ENTERPRISE_SOURCE!;
    const skill = process.env.SKILLS_E2E_ENTERPRISE_SKILL!;
    const sandbox = await Sandbox.create('enterprise-live');
    const env = { GIT_CONFIG_GLOBAL: process.env.SKILLS_E2E_GIT_CONFIG };
    await sandbox.skills(['add', source, '--skill', skill, '-a', 'aipro', '--copy', '-y'], { env });
    expect(readSkill(sandbox.path('.aipro', 'skills', skill)).name).toBe(skill);
    expect((await sandbox.skills(['check', '-p'], { env })).code).toBe(0);
    await sandbox.skills(['remove', skill, '-a', 'aipro', '-y'], { env });
  });
});
