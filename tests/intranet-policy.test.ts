import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertIntranetUrl, intranetFetch } from '../src/intranet.ts';
import { parseSource, fetchGitHubRepoInfo } from '../src/source-parser.ts';
import { getGitHubHost } from '../src/github-host.ts';
import { fetchRepoTree, tryBlobInstall } from '../src/blob.ts';
import { track, fetchAuditData, flushTelemetry } from '../src/telemetry.ts';
import { runFind, searchSkillsAPI } from '../src/find.ts';
import { cloneRepo } from '../src/git.ts';
import { runNtnApi } from '../src/notion-test.ts';

const host = 'code.sdsdev.co.kr';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('intranet source policy', () => {
  it('defaults shorthand and named skills to the corporate host', () => {
    vi.stubEnv('GH_HOST', '');
    expect(getGitHubHost()).toBe(host);
    expect(parseSource('team/repo')).toEqual({ type: 'git', url: `https://${host}/team/repo.git` });
    expect(parseSource('team/repo@my-skill')).toMatchObject({
      type: 'git',
      skillFilter: 'my-skill',
    });
    expect(parseSource('github:team/repo')).toMatchObject({ url: `https://${host}/team/repo.git` });
  });
  it('does not permit a public GH_HOST override', () => {
    vi.stubEnv('GH_HOST', 'github.com');
    expect(getGitHubHost()).toBe(host);
  });
  it('does not redirect a public pinned github: source into the enterprise host', () => {
    expect(() => parseSource('github:owner/repo', { githubHost: 'github.com' })).toThrow(
      'intranet-only'
    );
  });
  it('retains explicit enterprise tree paths and refs', () => {
    expect(parseSource(`https://${host}/team/repo/tree/main/skills/demo`)).toMatchObject({
      type: 'git',
      url: `https://${host}/team/repo.git`,
      ref: 'main',
      subpath: 'skills/demo',
    });
    expect(parseSource(`git@${host}:team/repo.git#feature/test`)).toMatchObject({
      ref: 'feature/test',
    });
  });
  it('preserves enterprise release downloads rather than cloning their repository', () => {
    const url = `https://${host}/team/repo/releases/download/v1/skills.tgz`;
    expect(parseSource(url)).toEqual({ type: 'download', url });
  });
  it('accepts local file Git URLs without allowing remote file hosts', () => {
    expect(parseSource('file:///tmp/local-repo')).toEqual({
      type: 'git',
      url: 'file:///tmp/local-repo',
    });
  });
  it('retains local directory sources', () => {
    expect(parseSource('./skills')).toMatchObject({ type: 'local' });
  });
  it.each([
    'https://github.com/team/repo',
    'git@github.com:team/repo.git',
    'https://code.sdsdev.co.kr.evil.test/team/repo',
    'https://code.sdsdev.co.kr@evil.test/team/repo',
    'https://user:secret@code.sdsdev.co.kr/team/repo',
    'http://code.sdsdev.co.kr/team/repo',
    'https://code.sdsdev.co.kr:8443/team/repo',
    'https://code.sdsdev.co.kr/team/repo?token=secret',
    'https://raw.githubusercontent.com/team/repo/main/SKILL.md',
    'https://skills.sh/p/test',
    'https://www.notion.so/test',
    '//outside.example/share/skills',
    String.raw`\\outside.example\share\skills`,
    String.raw`\\?\UNC\outside.example\share\skills`,
    'file://external-server/share/repo',
    'file:////external-server/share/repo',
    'file:///%2f%2fexternal-server/share/repo',
    'file:///%5c%5cexternal-server/share/repo',
    'ssh://git@evil.test/team/repo.git',
    'ext::git something',
  ])('rejects unsupported input without echoing credentials: %s', (input) => {
    expect(() => parseSource(input)).toThrow(/intranet-only/);
    try {
      parseSource(input);
    } catch (e) {
      expect(String(e)).not.toContain('secret');
    }
  });
  it('rejects external direct clone callers before invoking Git', async () => {
    await expect(cloneRepo('https://github.com/team/repo.git')).rejects.toThrow(/intranet-only/);
  });
});

describe('intranet network policy', () => {
  it('only fetches the exact HTTPS corporate host with redirects disabled', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    await intranetFetch(`https://${host}/file`, { redirect: 'follow' });
    expect(fetch).toHaveBeenCalledWith(`https://${host}/file`, { redirect: 'manual' });
    expect(() => assertIntranetUrl('https://evil.test/file')).toThrow();
  });
  it.each([301, 302, 303, 307, 308])(
    'rejects redirect status %s without a second request',
    async (status) => {
      const fetch = vi
        .fn()
        .mockResolvedValue(
          new Response(null, { status, headers: { location: 'https://evil.test/' } })
        );
      vi.stubGlobal('fetch', fetch);
      await expect(intranetFetch(`https://${host}/file`)).rejects.toThrow(/intranet-only/);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );
  it('rejects a foreign fetch before calling fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(intranetFetch('https://evil.test')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('disables public discovery, visibility checks, snapshots, telemetry and audit even with tokens', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    vi.stubEnv('GITHUB_TOKEN', 'public-secret');
    vi.stubEnv('GH_TOKEN', 'other-secret');
    vi.stubEnv('DISABLE_TELEMETRY', '');
    vi.stubEnv('DO_NOT_TRACK', '');
    vi.stubEnv('SKILLS_API_URL', 'https://evil.test');
    vi.stubEnv('SKILLS_DOWNLOAD_URL', 'https://evil.test');
    const token = vi.fn().mockReturnValue('secret');
    expect(await fetchGitHubRepoInfo('internal', 'private')).toBeNull();
    expect(await fetchRepoTree('internal/private', undefined, token)).toBeNull();
    expect(await tryBlobInstall('vercel-labs/agent-skills', { getToken: token })).toBeNull();
    expect(await searchSkillsAPI('internal secret')).toEqual([]);
    track({ event: 'find', query: 'internal secret', resultCount: '0' });
    expect(await fetchAuditData('internal/private', ['secret'])).toBeNull();
    await flushTelemetry();
    expect(fetch).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
  });
  it('find prints a clear disabled notice rather than misleading empty results', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runFind(['test']);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Public skill search is disabled'));
  });
  it('blocks Notion CLI delegation', async () => {
    await expect(runNtnApi(['/v1/ai/skills'])).rejects.toThrow(/intranet-only/);
  });
});
