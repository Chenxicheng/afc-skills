import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { create } from 'tar';

// Installed dependency fixtures are already built. Archive their local bytes
// rather than asking npm to re-evaluate a pnpm store directory as a source package.
// Never execute lifecycle scripts or include linked sibling dependencies.
export async function packInstalledPackage(directory: string, file: string): Promise<void> {
  const files: string[] = [];
  async function visit(relative: string): Promise<void> {
    for (const name of await readdir(join(directory, relative))) {
      if (name === 'node_modules' || name === '.git') continue;
      const path = relative ? `${relative}/${name}` : name;
      const stat = await lstat(join(directory, path));
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        throw new Error('Offline E2E dependency fixture contains a link or special file.');
      }
      if (stat.isDirectory()) await visit(path);
      else files.push(path);
    }
  }
  await visit('');
  if (!files.includes('package.json')) {
    throw new Error('Offline E2E dependency fixture has no package.json.');
  }
  await create(
    { cwd: directory, file, gzip: true, prefix: 'package/', portable: true, follow: false },
    files.sort()
  );
}
