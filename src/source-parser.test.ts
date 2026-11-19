import { afterEach, describe, it, expect, vi } from 'vitest';
import { parseSource } from './source-parser.js';

describe('source-parser', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('prefix shorthand fragments', () => {
    it.each([
      '#release%40v1@review',
      '#release%2540v1@review',
      '#main@code%40review',
      '#main@code%2520review',
      '#@review',
      '#feature/install@review',
    ])('preserves the parsed ref and selector when adding github: to %s', (fragment) => {
      expect(parseSource(`github:owner/repo${fragment}`)).toEqual(
        parseSource(`owner/repo${fragment}`)
      );
    });

    it.each(['#release%40v1', '#release%2540v1', '#feature/install'])(
      'preserves the parsed ref when adding gitlab: to %s',
      (fragment) => {
        expect(() => parseSource(`gitlab:owner/repo${fragment}`)).toThrow(/intranet-only/);
        expect(() => parseSource(`https://gitlab.com/owner/repo${fragment}`)).toThrow(
          /intranet-only/
        );
      }
    );
  });

  describe('GitLab Custom Domains & Subgroups', () => {
    it('intranet rejects: parses custom gitlab domain with deep subgroup paths', () => {
      expect(() =>
        parseSource('https://git.corp.com/group/subgroup/project/-/tree/main/src')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: parses gitlab tree with branch but no path', () => {
      expect(() => parseSource('https://gitlab.example.com/org/repo/-/tree/v1.0')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: parses custom gitlab domain with port number', () => {
      expect(() => parseSource('https://git.corp.com:8443/group/repo/-/tree/main')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: parses http protocol (non-ssl)', () => {
      expect(() => parseSource('http://git.local/group/repo/-/tree/dev')).toThrow(/intranet-only/);
    });

    it('intranet rejects: parses personal project path (~user)', () => {
      expect(() => parseSource('https://gitlab.com/~user/project/-/tree/main')).toThrow(
        /intranet-only/
      );
    });
  });

  describe('Azure Repos', () => {
    it('intranet rejects: does not treat Azure Repos HTTPS as well-known', () => {
      expect(() => parseSource('https://dev.azure.com/fabrikam/Fiber/_git/skills')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: parses Azure DevOps Server with port and /tfs/', () => {
      expect(() =>
        parseSource('http://ado.example.com:8080/tfs/DefaultCollection/MyProject/_git/skills')
      ).toThrow(/intranet-only/);
    });
  });

  describe('Simplified Git Strategy', () => {
    it('intranet rejects: treats custom domains with .git as generic git', () => {
      expect(() => parseSource('https://git.mycompany.com/my-group/my-repo.git')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: prevents false positives for generic URLs (falls through to well-known handling)', () => {
      expect(() => parseSource('https://google.com/search/result')).toThrow(/intranet-only/);
    });

    it('treats raw GitHub files as direct downloads', () => {
      const url = 'https://raw.githubusercontent.com/owner/repo/main/SKILL.md';
      expect(() => parseSource(url)).toThrow(/intranet-only/);
    });

    it('intranet rejects: retains official gitlab.com parsing for convenience', () => {
      expect(() => parseSource('https://gitlab.com/owner/repo')).toThrow(/intranet-only/);
    });
  });

  describe('Existing GitHub Support', () => {
    it('parses github shorthand', () => {
      const result = parseSource('vercel-labs/agent-skills');
      expect(result).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/vercel-labs/agent-skills.git',
        subpath: undefined,
      });
    });

    it('parses github full URL', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo/tree/main/path');
      expect(result).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/owner/repo.git',
        ref: 'main',
        subpath: 'path',
      });
    });

    it('does not treat GitHub blob anchors as refs', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo/blob/main/README.md#L10');
      expect(result).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/owner/repo.git',
      });
    });

    it('parses github shorthand with #branch', () => {
      const result = parseSource('vercel-labs/agent-skills#feature/install');
      expect(result).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/vercel-labs/agent-skills.git',
        ref: 'feature/install',
        subpath: undefined,
      });
    });

    it('parses github shorthand with trailing slash', () => {
      const result = parseSource('vercel-labs/agent-skills/');
      expect(result).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/vercel-labs/agent-skills.git',
        subpath: undefined,
      });
    });

    it('parses SSH git URL with #branch', () => {
      const result = parseSource('git@code.sdsdev.co.kr:owner/repo.git#feature/install');
      expect(result).toEqual({
        type: 'git',
        url: 'git@code.sdsdev.co.kr:owner/repo.git',
        ref: 'feature/install',
      });
    });

    it('uses GH_HOST for shorthand GitHub Enterprise sources', () => {
      vi.stubEnv('GH_HOST', 'code.sdsdev.co.kr');

      expect(parseSource('acme/agent-skills')).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/acme/agent-skills.git',
        subpath: undefined,
      });
    });

    it('uses GH_HOST for github: prefixed sources', () => {
      vi.stubEnv('GH_HOST', 'code.sdsdev.co.kr');

      expect(parseSource('github:acme/agent-skills@review')).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/acme/agent-skills.git',
        skillFilter: 'review',
      });
    });

    it('parses explicit GitHub Enterprise tree URLs', () => {
      vi.stubEnv('GH_HOST', 'code.sdsdev.co.kr');

      expect(
        parseSource('https://code.sdsdev.co.kr/acme/agent-skills/tree/main/skills/review')
      ).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/acme/agent-skills.git',
        ref: 'main',
        subpath: 'skills/review',
      });
    });

    it('does not override explicit code.sdsdev.co.kr URLs with GH_HOST', () => {
      vi.stubEnv('GH_HOST', 'code.sdsdev.co.kr');

      expect(parseSource('https://code.sdsdev.co.kr/owner/repo')).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/owner/repo.git',
      });
    });
  });
});
