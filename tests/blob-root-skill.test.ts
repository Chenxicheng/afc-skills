import { afterEach, describe, expect, it, vi } from 'vitest';
import { tryBlobInstall } from '../src/blob.ts';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('intranet snapshot policy', () => {
  it.each([
    {},
    { subpath: 'skills/demo' },
    { skillFilter: 'demo' },
    { includeInternal: true },
    { ref: 'main' },
    { ref: 'a'.repeat(40) },
  ])('never downloads root or nested public snapshots with options %j', async (options) => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const getToken = vi.fn(() => 'secret');
    vi.stubEnv('SKILLS_DOWNLOAD_URL', 'https://code.sdsdev.co.kr');
    expect(await tryBlobInstall('vercel-labs/skills', { ...options, getToken })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(getToken).not.toHaveBeenCalled();
  });
  it.each(['vercel-labs/skills', 'zapier/agent-skills', 'internal/private'])(
    'does not let source %s opt into snapshots',
    async (source) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect(await tryBlobInstall(source)).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
    }
  );
});
