import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFile } from 'node:child_process';
vi.mock('node:child_process', async (importActual) => ({
  ...(await importActual<typeof import('node:child_process')>()),
  execFile: vi.fn(),
}));
import { fetchRepoTree, resetRepoTreeAuthState } from '../src/blob.ts';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  resetRepoTreeAuthState();
});
describe('intranet tree API policy', () => {
  it.each([undefined, 'main', 'v1', 'a'.repeat(40)])(
    'never invokes HTTP, token resolver or gh for ref %j',
    async (ref) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      vi.stubEnv('GITHUB_TOKEN', 'public-token');
      vi.stubEnv('GH_TOKEN', 'other-token');
      vi.stubEnv('GH_HOST', 'code.sdsdev.co.kr');
      const getToken = vi.fn(() => 'secret');
      expect(await fetchRepoTree('internal/private', ref, getToken)).toBeNull();
      expect(await fetchRepoTree('vercel-labs/skills', ref, getToken)).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(getToken).not.toHaveBeenCalled();
      expect(execFile).not.toHaveBeenCalled();
    }
  );
  it('repeated calls and auth-state reset cannot re-enable API fallback', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    for (let i = 0; i < 3; i++) {
      resetRepoTreeAuthState();
      expect(await fetchRepoTree('internal/private')).toBeNull();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });
});
