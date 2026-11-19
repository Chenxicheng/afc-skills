import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Isolate side-effecting UI / network deps so runAdd can run headless in CI.
vi.mock('@clack/prompts', () => {
  const noop = () => {};
  return {
    intro: noop,
    outro: noop,
    note: noop,
    confirm: vi.fn().mockResolvedValue(true),
    cancel: noop,
    log: {
      info: noop,
      message: noop,
      warn: noop,
      error: (...a: unknown[]) => console.log('[clack.error]', ...a),
      step: noop,
      success: noop,
    },
    spinner: () => ({ start: noop, stop: noop }),
  };
});

vi.mock('../src/telemetry.ts', () => ({
  track: vi.fn(),
  setVersion: vi.fn(),
  fetchAuditData: vi.fn().mockResolvedValue(null),
}));

vi.mock('../src/detect-agent.ts', () => ({
  detectAgent: vi.fn().mockResolvedValue({ isAgent: false, agent: { name: 'none' } }),
  getAgentType: vi.fn(),
  ensureUniversalAgents: vi.fn((x: string[]) => x),
}));

// Keep parsing real; stub only the GitHub API lookup so the test runs offline.
vi.mock('../src/source-parser.ts', async (importActual) => {
  const actual = await importActual<typeof import('../src/source-parser.ts')>();
  return {
    ...actual,
    lookupGitHubRepo: vi.fn(),
  };
});

vi.mock('../src/git.ts', async (importActual) => ({
  ...(await importActual<typeof import('../src/git.ts')>()),
  cloneRepo: vi.fn(),
  cleanupTempDir: vi.fn().mockResolvedValue(undefined),
}));

import { runAdd } from '../src/add.ts';
import { resolveSource } from '../src/api/resolve.ts';
import { cloneRepo } from '../src/git.ts';
import { track } from '../src/telemetry.ts';
import {
  fetchGitHubRepoInfo,
  lookupGitHubRepo,
  parseSource,
  withCanonicalGitHubRepo,
} from '../src/source-parser.ts';

const renamed = { private: false, fullName: 'new-owner/new-repo' };

describe('withCanonicalGitHubRepo', () => {
  it('preserves pure canonicalization for legacy public source objects', () => {
    const parsed = {
      type: 'github' as const,
      url: 'https://github.com/old-owner/old-repo.git',
      ref: 'v1',
      subpath: 'skills/a',
      skillFilter: 'my-skill',
    };
    expect(withCanonicalGitHubRepo(parsed, renamed.fullName)).toEqual({
      ...parsed,
      url: 'https://github.com/new-owner/new-repo.git',
    });
    expect(withCanonicalGitHubRepo(parsed, null)).toBe(parsed);
  });
  it('never rewrites enterprise or local sources to public GitHub', () => {
    for (const input of ['old-owner/old-repo', './skills']) {
      const parsed = parseSource(input);
      expect(withCanonicalGitHubRepo(parsed, renamed.fullName)).toBe(parsed);
    }
  });
});
describe('fetchGitHubRepoInfo', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('does not transmit internal names to query public canonical names', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await fetchGitHubRepoInfo('old-owner', 'old-repo')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('enterprise source identity', () => {
  let base: string;
  let origCwd: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'github-rename-'));
    origCwd = process.cwd();
    vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as never);
  });

  async function makeRepo(): Promise<void> {
    const repo = join(base, 'repo');
    await mkdir(repo, { recursive: true });
    await writeFile(
      join(repo, 'SKILL.md'),
      '---\nname: renamed-skill\ndescription: test\n---\n',
      'utf-8'
    );
    vi.mocked(cloneRepo).mockResolvedValue(repo);
    vi.mocked(lookupGitHubRepo).mockResolvedValue(null);
  }

  afterEach(async () => {
    process.chdir(origCwd);
    await rm(base, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.mocked(track).mockClear();
  });

  it('locks the original corporate URL without public canonicalization', async () => {
    await makeRepo();
    const project = join(base, 'project');
    await mkdir(project, { recursive: true });
    process.chdir(project);
    await runAdd(['old-owner/old-repo'], {
      yes: true,
      agent: ['codex'],
      global: false,
      mode: 'copy',
    });

    const lock = JSON.parse(await readFile(join(project, 'skills-lock.json'), 'utf-8'));
    expect(lock.skills['renamed-skill'].source).toBe(
      'https://code.sdsdev.co.kr/old-owner/old-repo.git'
    );
    expect(track).not.toHaveBeenCalled();
  });

  it('reports the corporate source from the API', async () => {
    await makeRepo();
    const handle = await resolveSource('old-owner/old-repo', { cwd: base });
    expect(handle.source.url).toBe('https://code.sdsdev.co.kr/old-owner/old-repo.git');
    await handle.dispose();
  });
});
