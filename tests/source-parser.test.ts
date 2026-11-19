/**
 * Unit tests for source-parser.ts
 *
 * These tests verify the URL parsing logic - they don't make network requests
 * or clone repositories. They ensure that given a URL string, the parser
 * correctly extracts type, url, ref (branch), and subpath.
 */

import { describe, it, expect } from 'vitest';
import { platform } from 'os';
import { parseSource, getOwnerRepo } from '../src/source-parser.ts';

const isWindows = platform() === 'win32';

describe('parseSource', () => {
  describe('GitHub URL tests', () => {
    it('GitHub URL - basic repo', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBeUndefined();
      expect(result.subpath).toBeUndefined();
    });

    it('GitHub URL - with .git suffix', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
    });

    it('GitHub URL - with .git suffix and #branch', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo.git#feature/install');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('feature/install');
    });

    it('GitHub blob URL anchor is not treated as a ref', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo/blob/main/README.md#L10');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBeUndefined();
    });

    it('GitHub URL - tree with branch only', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo/tree/feature-branch');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('feature-branch');
      expect(result.subpath).toBeUndefined();
    });

    it('GitHub URL - tree with branch and path', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo/tree/main/skills/my-skill');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('main');
      expect(result.subpath).toBe('skills/my-skill');
    });

    // Note: Branch names with slashes (e.g., feature/my-feature) are ambiguous.
    // The parser treats the first segment as branch and rest as path.
    // This matches GitHub's URL structure behavior.
    it('GitHub URL - tree with slash in path (ambiguous branch)', () => {
      const result = parseSource('https://code.sdsdev.co.kr/owner/repo/tree/feature/my-feature');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('feature');
      expect(result.subpath).toBe('my-feature');
    });
  });

  describe('GitLab URL tests', () => {
    it('intranet rejects: GitLab URL - basic repo', () => {
      expect(() => parseSource('https://gitlab.com/owner/repo')).toThrow(/intranet-only/);
    });

    it('intranet rejects: GitLab URL - tree with branch only', () => {
      expect(() => parseSource('https://gitlab.com/owner/repo/-/tree/develop')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: GitLab URL - tree with branch and path', () => {
      expect(() => parseSource('https://gitlab.com/owner/repo/-/tree/main/src/skills')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: GitLab URL - with .git suffix', () => {
      expect(() => parseSource('https://gitlab.com/owner/repo.git')).toThrow(/intranet-only/);
    });

    it('intranet rejects: GitLab URL - subgroup (2 levels)', () => {
      expect(() => parseSource('https://gitlab.com/group/subgroup/repo')).toThrow(/intranet-only/);
    });

    it('intranet rejects: GitLab URL - subgroup (3 levels)', () => {
      expect(() => parseSource('https://gitlab.com/coresofthq/ai/agent-skills')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: GitLab URL - deep subgroup with .git suffix', () => {
      expect(() => parseSource('https://gitlab.com/org/team/project/repo.git')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: GitLab URL - subgroup with tree/branch', () => {
      expect(() => parseSource('https://gitlab.com/group/subgroup/repo/-/tree/main')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: GitLab URL - subgroup with tree/branch/path', () => {
      expect(() =>
        parseSource('https://gitlab.com/group/subgroup/repo/-/tree/main/path/to/skill')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: GitLab URL - trailing slash', () => {
      expect(() => parseSource('https://gitlab.com/group/subgroup/repo/')).toThrow(/intranet-only/);
    });
  });

  describe('Azure Repos URL tests', () => {
    it('intranet rejects: Azure DevOps Services clone URL is git, not well-known', () => {
      expect(() => parseSource('https://dev.azure.com/fabrikam/FabrikamFiber/_git/skills')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: Azure DevOps Services URL with .git suffix', () => {
      expect(() =>
        parseSource('https://dev.azure.com/fabrikam/FabrikamFiber/_git/skills.git')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: Azure DevOps Services web URL with path and branch query', () => {
      expect(() =>
        parseSource(
          'https://dev.azure.com/fabrikam/FabrikamFiber/_git/skills?path=/skills/web-design&version=GBmain'
        )
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: visualstudio.com clone URL', () => {
      expect(() =>
        parseSource('https://fabrikam.visualstudio.com/FabrikamFiber/_git/skills')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: Azure DevOps Server collection/project/_git/repo', () => {
      expect(() =>
        parseSource('https://ado.example.com/DefaultCollection/MyProject/_git/skills')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: Azure DevOps Server /tfs/ virtual directory', () => {
      expect(() =>
        parseSource('https://ado.example.com/tfs/DefaultCollection/MyProject/_git/skills')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: encoded spaces in organization and project', () => {
      expect(() =>
        parseSource('https://dev.azure.com/My%20Org/My%20Project/_git/agent-skills')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: version=GT is a tag ref; version=GC is not a cloneable ref', () => {
      expect(() =>
        parseSource('https://dev.azure.com/fabrikam/Fiber/_git/skills?version=GTv1.2.0')
      ).toThrow(/intranet-only/);
      expect(() =>
        parseSource(
          'https://dev.azure.com/fabrikam/Fiber/_git/skills?version=GC2c732a035bae9fb21e7823d37b2b9553e272f0c6'
        )
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: #fragment is a git ref on Azure Repos URLs', () => {
      expect(() =>
        parseSource('https://dev.azure.com/fabrikam/FabrikamFiber/_git/skills#release-2026')
      ).toThrow(/intranet-only/);
    });

    it('intranet rejects: trailing slash after repo name', () => {
      expect(() => parseSource('https://dev.azure.com/fabrikam/Fiber/_git/skills/')).toThrow(
        /intranet-only/
      );
    });
  });

  describe('corporate host and denied providers', () => {
    it.each([
      'https://raw.githubusercontent.com/acme/skills/main/SKILL.md',
      'https://github.com/acme/skills/releases/download/v1/skills.tgz',
      'https://gitlab.com/acme/skills/-/archive/main/skills-main.tar.gz',
      'https://gh-proxy.org/github.com/giikin/skills',
      'https://gh-proxy.org/https://github.com/giikin/skills/',
      'https://gh-proxy.org/github.com/owner/repo/tree/main/skills/my-skill',
      'https://gh-proxy.org/github.com/owner/repo#v1.0.0@my-skill',
      'https://mirror.example.com:8443/gitlab.com/group/sub/repo.git',
      'https://code.sdsdev.co.kr.example.com/owner/repo',
      'https://example.com/?next=code.sdsdev.co.kr/owner/repo',
      'https://gh-proxy.org/https://github.com/owner/repo/archive/main.zip',
      'https://www.code.sdsdev.co.kr/owner/repo',
      'https://code.sdsdev.co.kr/owner/repo?tab=readme-ov-file',
      'https://notgitlab.com/group/repo',
    ])('rejects external providers, proxy URLs and query parameters: %s', (url) => {
      expect(() => parseSource(url)).toThrow(/intranet-only/);
    });
    it.each([
      'https://code.sdsdev.co.kr/acme/skills/releases/download/v1/skills.tgz',
      'https://code.sdsdev.co.kr/acme/skills/archive/refs/heads/main.zip',
    ])('preserves corporate artifact URLs: %s', (url) => {
      expect(parseSource(url)).toEqual({ type: 'download', url });
    });
    it.each(['https://CODE.SDSDEV.CO.KR/owner/repo', 'https://code.sdsdev.co.kr/owner/repo.git/'])(
      'normalizes corporate HTTPS host and .git suffix: %s',
      (input) => {
        expect(parseSource(input)).toEqual({
          type: 'git',
          url: 'https://code.sdsdev.co.kr/owner/repo.git',
        });
      }
    );
    it('keeps a tree ref with trailing slash', () => {
      expect(parseSource('https://code.sdsdev.co.kr/owner/repo/tree/main/')).toEqual({
        type: 'git',
        url: 'https://code.sdsdev.co.kr/owner/repo.git',
        ref: 'main',
      });
    });
  });

  describe('GitHub shorthand tests', () => {
    it('GitHub shorthand - owner/repo', () => {
      const result = parseSource('owner/repo');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBeUndefined();
      expect(result.subpath).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo/path', () => {
      const result = parseSource('owner/repo/skills/my-skill');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.subpath).toBe('skills/my-skill');
    });

    it('GitHub shorthand - owner/repo/ trailing slash', () => {
      const result = parseSource('owner/repo/');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.subpath).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo@skill (skill filter syntax)', () => {
      const result = parseSource('owner/repo@my-skill');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.skillFilter).toBe('my-skill');
      expect(result.subpath).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo@skill with hyphenated skill name', () => {
      const result = parseSource('vercel-labs/agent-skills@find-skills');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/vercel-labs/agent-skills.git');
      expect(result.skillFilter).toBe('find-skills');
      expect(result.ref).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo@v1.2.3 pins the release tag', () => {
      const result = parseSource('mattpocock/skills@v1.3.1');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/mattpocock/skills.git');
      expect(result.ref).toBe('v1.3.1');
      expect(result.skillFilter).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo@tag keeps prerelease and build metadata', () => {
      const result = parseSource('owner/repo@v1.2.3-beta.1+build.5');
      expect(result.ref).toBe('v1.2.3-beta.1+build.5');
      expect(result.skillFilter).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo@version pins tags without v or a patch part', () => {
      for (const tag of ['1.2.3', 'v1.2', '2026.10.1', '1.0.0-rc.1']) {
        const result = parseSource(`owner/repo@${tag}`);
        expect(result.ref).toBe(tag);
        expect(result.skillFilter).toBeUndefined();
      }
    });

    it('GitHub shorthand - owner/repo@<full sha> pins the commit', () => {
      const sha = 'd22f72308106ef62f558cbde16dacb1f21031ae3';
      const result = parseSource(`owner/repo@${sha}`);
      expect(result.ref).toBe(sha);
      expect(result.skillFilter).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo@name does not treat skill-like names as pins', () => {
      for (const name of ['find-skills', 'v2', '2', 'v1.x', 'web-design-guidelines']) {
        const result = parseSource(`owner/repo@${name}`);
        expect(result.ref).toBeUndefined();
        expect(result.skillFilter).toBe(name);
      }
    });

    it('GitHub shorthand - owner/repo#branch', () => {
      const result = parseSource('owner/repo#my-branch');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('my-branch');
      expect(result.subpath).toBeUndefined();
    });

    it('GitHub shorthand - owner/repo/path#branch', () => {
      const result = parseSource('owner/repo/skills/my-skill#feature/skills');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('feature/skills');
      expect(result.subpath).toBe('skills/my-skill');
    });

    it('GitHub shorthand - owner/repo#branch@skill', () => {
      const result = parseSource('owner/repo#my-branch@my-skill');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('my-branch');
      expect(result.skillFilter).toBe('my-skill');
    });
  });

  describe('Local path tests', () => {
    it('Local path - relative with ./', () => {
      const result = parseSource('./my-skills');
      expect(result.type).toBe('local');
      expect(result.localPath).toContain('my-skills');
    });

    it('Local path - relative with ../', () => {
      const result = parseSource('../other-skills');
      expect(result.type).toBe('local');
      expect(result.localPath).toContain('other-skills');
    });

    it('Local path - current directory', () => {
      const result = parseSource('.');
      expect(result.type).toBe('local');
      expect(result.localPath).toBeTruthy();
    });

    it('Local path - absolute path', () => {
      // Use platform-specific absolute path
      const testPath = isWindows ? 'C:\\Users\\test\\skills' : '/home/user/skills';
      const result = parseSource(testPath);
      expect(result.type).toBe('local');
      expect(result.localPath).toBe(testPath);
    });
  });

  describe('Git URL fallback tests', () => {
    it('Git URL - SSH format', () => {
      const result = parseSource('git@code.sdsdev.co.kr:owner/repo.git');
      expect(result.type).toBe('git');
      expect(result.url).toBe('git@code.sdsdev.co.kr:owner/repo.git');
    });

    it('Git URL - SSH format with #branch', () => {
      const result = parseSource('git@code.sdsdev.co.kr:owner/repo.git#feature/install');
      expect(result.type).toBe('git');
      expect(result.url).toBe('git@code.sdsdev.co.kr:owner/repo.git');
      expect(result.ref).toBe('feature/install');
    });

    it('Git URL - SSH format with /tree/branch', () => {
      const result = parseSource('git@code.sdsdev.co.kr:owner/repo/tree/mybranch');
      expect(result.type).toBe('git');
      expect(result.url).toBe('git@code.sdsdev.co.kr:owner/repo.git');
      expect(result.ref).toBe('mybranch');
      expect(result.subpath).toBeUndefined();
    });

    it('Git URL - SSH format with /tree/branch/path', () => {
      const result = parseSource('git@code.sdsdev.co.kr:owner/repo/tree/mybranch/skills/foo');
      expect(result.type).toBe('git');
      expect(result.url).toBe('git@code.sdsdev.co.kr:owner/repo.git');
      expect(result.ref).toBe('mybranch');
      expect(result.subpath).toBe('skills/foo');
    });

    it('Git URL - SSH format with .git and /tree/branch', () => {
      const result = parseSource('git@code.sdsdev.co.kr:owner/repo.git/tree/mybranch');
      expect(result.type).toBe('git');
      expect(result.url).toBe('git@code.sdsdev.co.kr:owner/repo.git');
      expect(result.ref).toBe('mybranch');
    });

    it('intranet rejects: Git URL - SSH format with /tree/ on non-GitHub host is left as-is', () => {
      expect(() => parseSource('git@git.example.com:group/repo/tree/mybranch.git')).toThrow(
        /intranet-only/
      );
    });

    it('Git URL - SSH format with /tree/ rejects path traversal', () => {
      expect(() => parseSource('git@code.sdsdev.co.kr:owner/repo/tree/main/../../etc')).toThrow(
        /Unsafe subpath/
      );
    });

    it('intranet rejects: Git URL - custom host', () => {
      expect(() => parseSource('https://git.example.com/owner/repo.git')).toThrow(/intranet-only/);
    });

    it('intranet rejects: Git URL - https format with #branch', () => {
      expect(() => parseSource('https://git.example.com/owner/repo.git#release-2026')).toThrow(
        /intranet-only/
      );
    });

    it('intranet rejects: Git URL - ssh scheme with #branch', () => {
      expect(() =>
        parseSource('ssh://git@git.example.com:7999/owner/repo.git#release-2026')
      ).toThrow(/intranet-only/);
    });
  });
});

describe('getOwnerRepo', () => {
  it('getOwnerRepo - GitHub URL', () => {
    const parsed = parseSource('https://code.sdsdev.co.kr/owner/repo');
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - GitHub URL with .git', () => {
    const parsed = parseSource('https://code.sdsdev.co.kr/owner/repo.git');
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - GitHub URL with tree/branch/path', () => {
    const parsed = parseSource('https://code.sdsdev.co.kr/owner/repo/tree/main/skills/my-skill');
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - GitHub shorthand', () => {
    const parsed = parseSource('owner/repo');
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - GitHub shorthand with subpath', () => {
    const parsed = parseSource('owner/repo/skills/my-skill');
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('intranet rejects: getOwnerRepo - GitLab URL', () => {
    expect(() => parseSource('https://gitlab.com/owner/repo')).toThrow(/intranet-only/);
  });

  it('intranet rejects: getOwnerRepo - GitLab URL with tree', () => {
    expect(() => parseSource('https://gitlab.com/owner/repo/-/tree/main/skills')).toThrow(
      /intranet-only/
    );
  });

  it('intranet rejects: getOwnerRepo - GitLab URL with subgroup', () => {
    expect(() => parseSource('https://gitlab.com/coresofthq/ai/agent-skills')).toThrow(
      /intranet-only/
    );
  });

  it('getOwnerRepo - local path returns null', () => {
    const parsed = parseSource('./my-skills');
    expect(getOwnerRepo(parsed)).toBeNull();
  });

  it('getOwnerRepo - absolute local path returns null', () => {
    const parsed = parseSource('/home/user/skills');
    expect(getOwnerRepo(parsed)).toBeNull();
  });

  it('intranet rejects: getOwnerRepo - custom git host extracts owner/repo', () => {
    expect(() => parseSource('https://git.example.com/owner/repo.git')).toThrow(/intranet-only/);
  });

  it('getOwnerRepo - SSH format extracts owner/repo', () => {
    const parsed = parseSource('git@code.sdsdev.co.kr:owner/repo.git');
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('intranet rejects: getOwnerRepo - private GitLab instance extracts owner/repo', () => {
    expect(() => parseSource('https://gitlab.company.com/team/repo')).toThrow(/intranet-only/);
  });

  it('intranet rejects: getOwnerRepo - self-hosted git with .git suffix', () => {
    expect(() => parseSource('https://git.internal.io/myteam/skills.git')).toThrow(/intranet-only/);
  });

  it('getOwnerRepo - URL with query string', () => {
    const parsed = { type: 'git', url: 'https://git.example.com/owner/repo?ref=main' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - URL with fragment', () => {
    const parsed = { type: 'git', url: 'https://git.example.com/owner/repo#readme' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - URL with .git and query string', () => {
    const parsed = { type: 'git', url: 'https://git.example.com/owner/repo.git?ref=main' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - GitLab subgroup (2 levels)', () => {
    const parsed = { type: 'git', url: 'https://gitlab.com/group/subgroup/repo' } as const;
    expect(getOwnerRepo(parsed)).toBe('group/subgroup/repo');
  });

  it('getOwnerRepo - GitLab subgroup (3 levels)', () => {
    const parsed = { type: 'git', url: 'https://gitlab.com/org/team/project/repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBe('org/team/project/repo');
  });

  it('getOwnerRepo - GitLab subgroup with query string', () => {
    const parsed = { type: 'git', url: 'https://gitlab.com/group/subgroup/repo?ref=main' } as const;
    expect(getOwnerRepo(parsed)).toBe('group/subgroup/repo');
  });

  it('getOwnerRepo - self-hosted GitLab with subgroups', () => {
    const parsed = {
      type: 'git',
      url: 'https://gitlab.company.com/division/team/repo.git',
    } as const;
    expect(getOwnerRepo(parsed)).toBe('division/team/repo');
  });

  it('getOwnerRepo - SSH URL (GitHub)', () => {
    const parsed = { type: 'git', url: 'git@code.sdsdev.co.kr:owner/repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - SSH URL (GitLab)', () => {
    const parsed = { type: 'git', url: 'git@gitlab.com:owner/repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - SSH URL with subgroups (GitLab)', () => {
    const parsed = {
      type: 'git',
      url: 'git@gitlab.com:group/subgroup/project/repo.git',
    } as const;
    expect(getOwnerRepo(parsed)).toBe('group/subgroup/project/repo');
  });

  it('getOwnerRepo - SSH URL without .git suffix', () => {
    const parsed = { type: 'git', url: 'git@code.sdsdev.co.kr:owner/repo' } as const;
    expect(getOwnerRepo(parsed)).toBe('owner/repo');
  });

  it('getOwnerRepo - SSH URL (custom host)', () => {
    const parsed = { type: 'git', url: 'git@git.company.com:org/team/repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBe('org/team/repo');
  });

  it('getOwnerRepo - SSH URL with scheme and port', () => {
    const parsed = {
      type: 'git',
      url: 'ssh://git@git.company.com:7999/org/team/repo.git',
    } as const;
    expect(getOwnerRepo(parsed)).toBe('org/team/repo');
  });

  it('getOwnerRepo - SSH URL without path (returns null)', () => {
    const parsed = { type: 'git', url: 'git@code.sdsdev.co.kr:repo.git' } as const;
    expect(getOwnerRepo(parsed)).toBeNull();
  });
});

describe('Source aliases', () => {
  it('does not apply public aliases to enterprise coinbase/agentWallet', () => {
    const result = parseSource('coinbase/agentWallet');
    expect(result.type).toBe('git');
    expect(result.url).toBe('https://code.sdsdev.co.kr/coinbase/agentWallet.git');
  });

  it('does not apply public aliases to enterprise vercel-labs/vercel-skills', () => {
    const result = parseSource('vercel-labs/vercel-skills');
    expect(result.type).toBe('git');
    expect(result.url).toBe('https://code.sdsdev.co.kr/vercel-labs/vercel-skills.git');
  });
});

describe('Prefix shorthand tests', () => {
  describe('github: prefix', () => {
    it('github:owner/repo - basic', () => {
      const result = parseSource('github:owner/repo');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.subpath).toBeUndefined();
    });

    it('github:owner/repo/subpath', () => {
      const result = parseSource('github:owner/repo/skills/my-skill');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.subpath).toBe('skills/my-skill');
    });

    it('github:owner/repo@skill-name', () => {
      const result = parseSource('github:owner/repo@my-skill');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.skillFilter).toBe('my-skill');
    });

    it('github:googleworkspace/cli', () => {
      const result = parseSource('github:googleworkspace/cli');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/googleworkspace/cli.git');
    });

    it('github:owner/repo#branch', () => {
      const result = parseSource('github:owner/repo#feature/install');
      expect(result.type).toBe('git');
      expect(result.url).toBe('https://code.sdsdev.co.kr/owner/repo.git');
      expect(result.ref).toBe('feature/install');
    });
  });

  describe('gitlab: prefix', () => {
    it('intranet rejects: gitlab:owner/repo - basic', () => {
      expect(() => parseSource('gitlab:owner/repo')).toThrow(/intranet-only/);
    });

    it('intranet rejects: gitlab:group/subgroup/repo', () => {
      expect(() => parseSource('gitlab:group/subgroup/repo')).toThrow(/intranet-only/);
    });
  });
});
