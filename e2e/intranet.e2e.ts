import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Sandbox, readSkill, type JsonListEntry } from './sandbox.ts';

const markdown = (body: string) =>
  `---\nname: local-demo\ndescription: Intranet E2E fixture\n---\n\n${body}\n`;
async function fixture(sandbox: Sandbox) {
  const source = join(sandbox.root, 'fixture');
  await mkdir(source);
  await writeFile(join(source, 'SKILL.md'), markdown('version one'));
  return source;
}
async function forbidFetch(sandbox: Sandbox) {
  const requests = join(sandbox.root, 'fetch-attempts.jsonl');
  const hook = join(sandbox.root, 'forbid-fetch.mjs');
  await writeFile(
    hook,
    `import { appendFileSync } from 'node:fs';\nglobalThis.fetch = async (url) => { appendFileSync(${JSON.stringify(requests)}, JSON.stringify(String(url))+'\\n'); throw new Error('E2E forbids fetch'); };\n`
  );
  return {
    requests,
    env: {
      NODE_OPTIONS: `--import=${pathToFileURL(hook).href}`,
      DISABLE_TELEMETRY: '',
      DO_NOT_TRACK: '',
      GITHUB_TOKEN: 'dummy-public-token',
      GH_TOKEN: 'dummy-gh-token',
    },
  };
}

describe('installed intranet CLI', () => {
  it('installs and lists a local Skill for aipro and Claude Code, then removes it', async () => {
    const sandbox = await Sandbox.create('local-cli');
    const source = await fixture(sandbox);
    const guard = await forbidFetch(sandbox);
    const result = await sandbox.skillsJson(
      ['add', source, '-a', 'aipro', 'claude-code', '--copy', '-y'],
      { env: guard.env }
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: 'local-demo', status: 'installed', mode: 'copy' });
    expect(readSkill(sandbox.path('.aipro', 'skills', 'local-demo')).body).toContain('version one');
    expect(readSkill(sandbox.path('.claude', 'skills', 'local-demo')).name).toBe('local-demo');
    const listed = await sandbox.skillsJson<JsonListEntry[]>(['list'], { env: guard.env });
    expect(listed.map((x) => x.name)).toContain('local-demo');
    await sandbox.skills(['remove', 'local-demo', '-a', 'aipro', 'claude-code', '-y'], {
      env: guard.env,
    });
    expect(existsSync(sandbox.path('.aipro', 'skills', 'local-demo'))).toBe(false);
    expect(existsSync(sandbox.path('.claude', 'skills', 'local-demo'))).toBe(false);
    expect(existsSync(guard.requests)).toBe(false);
  });

  it('checks and updates a real local Git source without HTTP services', async () => {
    const sandbox = await Sandbox.create('local-git-update');
    const source = await fixture(sandbox);
    const guard = await forbidFetch(sandbox);
    for (const args of [
      ['init', '-b', 'main'],
      ['config', 'user.name', 'E2E'],
      ['config', 'user.email', 'e2e@example.invalid'],
      ['add', '.'],
      ['commit', '-m', 'initial'],
    ])
      await sandbox.run('git', args, { cwd: source });
    const url = pathToFileURL(source).href;
    await sandbox.skills(['add', url, '-a', 'aipro', '--copy', '-y'], { env: guard.env });
    expect(sandbox.projectLock().skills['local-demo']).toMatchObject({
      sourceType: 'git',
      source: url,
    });
    const before = await sandbox.skills(['check', '-p'], { env: guard.env });
    expect(before.code).toBe(0);
    await writeFile(join(source, 'SKILL.md'), markdown('version two'));
    await sandbox.run('git', ['add', '.'], { cwd: source });
    await sandbox.run('git', ['commit', '-m', 'update'], { cwd: source });
    const check = await sandbox.skills(['check', '-p'], { env: guard.env, check: false });
    expect(check.code).toBe(1);
    expect(check.output).toContain('local-demo');
    expect(readSkill(sandbox.path('.aipro', 'skills', 'local-demo')).body).toContain('version one');
    await sandbox.skills(['update', '-p', '-y'], { env: guard.env });
    expect(readSkill(sandbox.path('.aipro', 'skills', 'local-demo')).body).toContain('version two');
    expect(existsSync(guard.requests)).toBe(false);
  });

  it.each([
    'https://github.com/acme/skills',
    'git@github.com:acme/skills.git',
    'https://code.sdsdev.co.kr.evil.invalid/acme/skills',
    'https://user:secret@code.sdsdev.co.kr/acme/skills',
  ])('rejects forbidden source %s before fetching', async (source) => {
    const sandbox = await Sandbox.create('reject');
    const guard = await forbidFetch(sandbox);
    const result = await sandbox.skills(['add', source, '-a', 'aipro', '-y'], {
      env: guard.env,
      check: false,
    });
    expect(result.code).not.toBe(0);
    expect(result.output).toContain('intranet-only');
    expect(result.output).not.toContain('secret');
    expect(existsSync(guard.requests)).toBe(false);
    expect(existsSync(sandbox.path('skills-lock.json'))).toBe(false);
  });
  it('find reports disabled public search and does not attempt fetch even with telemetry enabled in environment', async () => {
    const sandbox = await Sandbox.create('find');
    const guard = await forbidFetch(sandbox);
    const result = await sandbox.skills(['find', 'internal-secret'], { env: guard.env });
    expect(result.output).toContain('Public skill search is disabled');
    expect(existsSync(guard.requests)).toBe(false);
  });
});

describe('installed intranet API', () => {
  it('resolves, installs, lists, rejects a public source and removes without output or fetch', async () => {
    const sandbox = await Sandbox.create('local-api');
    const source = await fixture(sandbox);
    const guard = await forbidFetch(sandbox);
    const result = await sandbox.api<{
      installed: number;
      failed: unknown[];
      names: string[];
      publicCode: string;
      after: number;
    }>(
      `
      const source=await api.resolveSource(${JSON.stringify(source)},{cwd:project});
      const installed=await api.installSkills(source,{cwd:project,agents:['aipro'],mode:'copy'});
      await source.dispose();
      const names=(await api.listSkills({cwd:project,scope:'project'})).skills.map(s=>s.name);
      const publicCode=await codeOf(api.resolveSource('https://github.com/acme/skills',{cwd:project}));
      await api.removeSkills(['local-demo'],{cwd:project,agents:['aipro']});
      const after=(await api.listSkills({cwd:project,scope:'project'})).skills.length;
      return {installed:installed.installed.length,failed:installed.failed,names,publicCode,after};
    `,
      { env: guard.env }
    );
    expect(result.value).toEqual({
      installed: 1,
      failed: [],
      names: ['local-demo'],
      publicCode: 'SKILLS_INVALID_OPTION_VALUE',
      after: 0,
    });
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
    expect(existsSync(guard.requests)).toBe(false);
  });
});
