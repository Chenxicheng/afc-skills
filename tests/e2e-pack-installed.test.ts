import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  chmod,
  stat,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { extract, list } from 'tar';
import { packInstalledPackage } from '../e2e/pack-installed.ts';

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'afc-dependency-pack-'));
  roots.push(root);
  const source = join(root, 'source');
  await mkdir(source);
  await writeFile(
    join(source, 'package.json'),
    JSON.stringify({
      name: 'local-fixture',
      version: '1.0.0',
      scripts: { prepare: 'node -e "process.exit(99)"', prepack: 'node -e "process.exit(99)"' },
    })
  );
  return { root, source, file: join(root, 'fixture.tgz') };
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it('archives built bytes under package/ without lifecycle execution or nested dependencies', async () => {
  const { root, source, file } = await fixture();
  await mkdir(join(source, 'dist'));
  await writeFile(join(source, 'dist', 'cli.js'), '#!/usr/bin/env node\nconsole.log(42);\n');
  await chmod(join(source, 'dist', 'cli.js'), 0o755);
  for (const dir of ['node_modules', '.git']) {
    await mkdir(join(source, dir));
    await writeFile(join(source, dir, 'excluded'), 'not part of this package');
  }
  await packInstalledPackage(source, file);
  const entries: string[] = [];
  await list({
    file,
    onReadEntry: (entry) => {
      entries.push(entry.path);
    },
  });
  expect(entries).toEqual(['package/dist/cli.js', 'package/package.json']);
  const destination = join(root, 'extract');
  await mkdir(destination);
  await extract({ file, cwd: destination });
  expect(await readFile(join(destination, 'package', 'dist', 'cli.js'), 'utf8')).toContain(
    'console.log(42)'
  );
  if (process.platform !== 'win32')
    expect((await stat(join(destination, 'package', 'dist', 'cli.js'))).mode & 0o111).toBe(0o111);
  expect(await readdir(join(destination, 'package'))).toEqual(['dist', 'package.json']);
});

it('rejects symbolic links instead of including or following outside files', async () => {
  const { root, source, file } = await fixture();
  const outside = join(root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'secret'), 'must not be packed');
  await symlink(outside, join(source, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await expect(packInstalledPackage(source, file)).rejects.toThrow('link or special file');
});

it('rejects a directory without package metadata', async () => {
  const { source, file } = await fixture();
  await rm(join(source, 'package.json'));
  await expect(packInstalledPackage(source, file)).rejects.toThrow('no package.json');
});
