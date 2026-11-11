import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { agents, detectInstalledAgents } from '../src/agents.ts';
import { getAgentBaseDir, installBlobSkillForAgent, isSkillInstalled } from '../src/installer.ts';

const temporaryDirs: string[] = [];
async function makeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'skills-aipro-'));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('aipro agent support', () => {
  it('uses the requested project and global skills directories', () => {
    expect(agents.aipro.name).toBe('aipro');
    expect(agents.aipro.skillsDir).toBe('.aipro/skills');
    expect(agents.aipro.globalSkillsDir).toBe(join(homedir(), '.aipro', 'skills'));
    expect(getAgentBaseDir('aipro', false, '/tmp/project')).toBe('/tmp/project/.aipro/skills');
    expect(getAgentBaseDir('aipro', true, '/tmp/project')).toBe(
      join(homedir(), '.aipro', 'skills')
    );
  });

  it('detects aipro in the selected project', async () => {
    const project = await makeProject();
    await mkdir(join(project, '.aipro'));
    await expect(agents.aipro.detectInstalled(project)).resolves.toBe(true);
    await expect(detectInstalledAgents(project)).resolves.toContain('aipro');
  });

  it.each(['copy', 'symlink'] as const)(
    'installs readable project skills in %s mode',
    async (mode) => {
      const project = await makeProject();
      const contents = '---\nname: demo\ndescription: Test skill\n---\n# Demo\n';
      const result = await installBlobSkillForAgent(
        { installName: 'demo', files: [{ path: 'SKILL.md', contents }] },
        'aipro',
        { cwd: project, mode, global: false, createMissingAgentRoot: true }
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe(join(project, '.aipro', 'skills', 'demo'));
      expect(await readFile(join(project, '.aipro', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(
        contents
      );
      await expect(isSkillInstalled('demo', 'aipro', { cwd: project })).resolves.toBe(true);
    }
  );
});
