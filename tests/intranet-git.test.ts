import { afterEach, describe, expect, it, vi } from 'vitest';
import { rm } from 'node:fs/promises';
const mocks = vi.hoisted(() => ({ simpleGit: vi.fn(), execFile: vi.fn() }));
vi.mock('simple-git', () => ({ simpleGit: mocks.simpleGit }));
vi.mock('child_process', async () => ({
  ...(await vi.importActual<typeof import('child_process')>('child_process')),
  execFile: mocks.execFile,
}));
import { cloneRepo } from '../src/git.ts';
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
  vi.resetAllMocks();
});
function client(clone = vi.fn().mockResolvedValue(undefined)) {
  const result = { clone, env: vi.fn(), cwd: vi.fn(), submoduleUpdate: vi.fn() };
  result.env.mockReturnValue(result);
  return result;
}
describe('intranet Git transport', () => {
  it('keeps the corporate URL and never initializes recursive submodules', async () => {
    const git = client();
    mocks.simpleGit.mockReturnValue(git);
    const dir = await cloneRepo('https://code.sdsdev.co.kr/team/skills.git');
    dirs.push(dir);
    expect(git.clone).toHaveBeenCalledWith('https://code.sdsdev.co.kr/team/skills.git', dir, [
      '--depth',
      '1',
    ]);
    expect(git.submoduleUpdate).not.toHaveBeenCalled();
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(mocks.simpleGit.mock.calls[0]![0].config).toEqual(
      expect.arrayContaining([
        'http.followRedirects=false',
        'submodule.recurse=false',
        'fetch.recurseSubmodules=false',
      ])
    );
  });
  it('authentication failure only falls back to SSH on the same enterprise host, never gh', async () => {
    const https = client(vi.fn().mockRejectedValue(new Error('Authentication failed')));
    const ssh = client();
    mocks.simpleGit.mockReturnValueOnce(https).mockReturnValueOnce(ssh);
    const dir = await cloneRepo('https://code.sdsdev.co.kr/team/skills.git');
    dirs.push(dir);
    expect(ssh.clone).toHaveBeenCalledWith('git@code.sdsdev.co.kr:team/skills.git', dir, [
      '--depth',
      '1',
    ]);
    expect(mocks.execFile).not.toHaveBeenCalled();
    expect(ssh.submoduleUpdate).not.toHaveBeenCalled();
  });
  it('rejects foreign hosts before creating a Git process', async () => {
    await expect(cloneRepo('https://github.com/team/skills.git')).rejects.toThrow(/intranet-only/);
    expect(mocks.simpleGit).not.toHaveBeenCalled();
  });
});
