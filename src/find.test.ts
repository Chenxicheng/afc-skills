import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseFindOptions, runFind, searchSkills, searchSkillsAPI } from './find.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('parseFindOptions', () => {
  it('separates and normalizes an owner from a multi-word query', () => {
    expect(parseFindOptions(['react', 'native', '--owner', 'Vercel'])).toEqual({
      query: 'react native',
      options: { owner: 'vercel' },
      errors: [],
    });
  });

  it('supports the --owner=value form', () => {
    expect(parseFindOptions(['--owner=vercel-labs', 'next'])).toEqual({
      query: 'next',
      options: { owner: 'vercel-labs' },
      errors: [],
    });
  });

  it('rejects missing and invalid owners', () => {
    expect(parseFindOptions(['react', '--owner']).errors.map((e) => e.message)).toEqual([
      '--owner requires a GitHub owner',
    ]);
    expect(
      parseFindOptions(['react', '--owner', 'not/an/owner']).errors.map((e) => e.message)
    ).toEqual(['--owner must be a valid GitHub owner']);
  });
});

describe('intranet search policy', () => {
  it.each(['secret', 'internal project name', 'a b c d'])(
    'never transmits query %s or fans out to public search',
    async (query) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      vi.stubEnv('SKILLS_API_URL', 'https://evil.example');
      expect(await searchSkillsAPI(query, 'internal-owner')).toEqual([]);
      expect(await searchSkills(query)).toEqual({ skills: [], exactCount: 0 });
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it.each([{ args: [] }, { args: ['secret'] }, { args: ['secret', '--owner', 'internal-owner'] }])(
    'reports disabled search for arguments %j',
    async ({ args }) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      await runFind(args);
      const output = log.mock.calls.flat().join('\n');
      expect(output).toContain('Public skill search is disabled');
      expect(output).toContain('afc-skills add <organization/repository> --list');
      expect(output).not.toContain('No skills found');
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
