import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { TestProject } from 'vitest/node';
import { cleanEnv } from './env.ts';
import { packInstalledPackage } from './pack-installed.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    e2eRoot: string;
    skillsBin: string;
    installDir: string;
    tarball: string;
    npmCache: string;
  }
}

const repoRoot = resolve(import.meta.dirname, '..');
const isWindows = process.platform === 'win32';
function sh(cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): void {
  execFileSync(cmd, args, { cwd, env, stdio: 'inherit', shell: isWindows });
}

// Repack only already-installed production dependencies. No registry metadata,
// downloads, lifecycle scripts or pnpm-store implementation assumptions are needed.
async function packInstalledDependencies(
  packDir: string,
  env: NodeJS.ProcessEnv
): Promise<string[]> {
  const visited = new Map<string, string>();
  const names = new Map<string, string>();
  const artifacts: string[] = [];
  async function visit(name: string, from: string): Promise<void> {
    let entry: string;
    try {
      entry = createRequire(join(from, 'package.json')).resolve(name);
    } catch {
      throw new Error(
        `Offline E2E blocked: installed production dependency ${name} is missing. Prepare dependencies before running E2E.`
      );
    }
    let dir = dirname(entry);
    let pkg: { name: string; version: string; dependencies?: Record<string, string> };
    while (true) {
      const candidate = join(dir, 'package.json');
      if (existsSync(candidate)) {
        const metadata = JSON.parse(await readFile(candidate, 'utf8'));
        if (metadata.name === name) {
          pkg = metadata;
          break;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`Cannot locate installed package ${name}`);
      dir = parent;
    }
    dir = await realpath(dir);
    if (names.has(name) && names.get(name) !== pkg.version)
      throw new Error(
        `Offline E2E dependency fixture requires multiple versions of ${name}; provide a populated npm cache instead.`
      );
    names.set(name, pkg.version);
    if (visited.has(dir)) return;
    visited.set(dir, pkg.version);
    for (const dependency of Object.keys(pkg.dependencies ?? {})) await visit(dependency, dir);
    const file = join(packDir, `dependency-${artifacts.length}.tgz`);
    await packInstalledPackage(dir, file);
    artifacts.push(file);
  }
  const pkg = JSON.parse(await readFile(join(repoRoot, 'package.json'), 'utf8'));
  for (const name of Object.keys(pkg.dependencies ?? {})) await visit(name, repoRoot);
  return artifacts;
}

export default async function setup(project: TestProject) {
  const supplied = process.env.SKILLS_E2E_PACKAGE;
  if (supplied && (!supplied.endsWith('.tgz') || /^\w+:\/\//.test(supplied))) {
    throw new Error(
      'SKILLS_E2E_PACKAGE must be a local .tgz file; registry specs and URLs are forbidden.'
    );
  }
  const root = await mkdtemp(join(tmpdir(), 'skills-e2e-'));
  const npmHome = join(root, 'npm-home');
  const npmCache = process.env.SKILLS_E2E_NPM_CACHE
    ? resolve(process.env.SKILLS_E2E_NPM_CACHE)
    : join(root, 'npm-cache');
  const installDir = join(root, 'install');
  const packDir = join(root, 'pack');
  await Promise.all(
    [npmHome, npmCache, installDir, packDir].map((p) => mkdir(p, { recursive: true }))
  );
  const env = cleanEnv({
    HOME: npmHome,
    USERPROFILE: npmHome,
    npm_config_cache: npmCache,
    npm_config_offline: 'true',
    npm_config_ignore_scripts: 'true',
    npm_config_update_notifier: 'false',
    COREPACK_ENABLE_NETWORK: '0',
  });
  try {
    let tarball: string;
    if (supplied) tarball = isAbsolute(supplied) ? supplied : resolve(repoRoot, supplied);
    else {
      sh('pnpm', ['build'], repoRoot, env);
      sh(
        'npm',
        ['pack', '--offline', '--ignore-scripts', '--pack-destination', packDir],
        repoRoot,
        env
      );
      const file = (await readdir(packDir)).find((f) => f.endsWith('.tgz'));
      if (!file) throw new Error('npm pack produced no tarball');
      tarball = join(packDir, file);
    }
    const dependencies = process.env.SKILLS_E2E_NPM_CACHE
      ? []
      : await packInstalledDependencies(packDir, env);
    await writeFile(join(installDir, 'package.json'), '{"private":true}\n');
    try {
      sh(
        'npm',
        [
          'install',
          '--offline',
          '--ignore-scripts',
          '--no-audit',
          '--no-fund',
          '--no-package-lock',
          tarball,
          ...dependencies,
        ],
        installDir,
        env
      );
    } catch (cause) {
      throw new Error(
        'Offline E2E package installation failed. Prepare the exact runtime dependencies or a complete SKILLS_E2E_NPM_CACHE; no online retry is attempted.',
        { cause }
      );
    }
    const pkgDir = join(installDir, 'node_modules', 'afc-skills');
    const pkg = JSON.parse(await readFile(join(pkgDir, 'package.json'), 'utf8'));
    project.provide('e2eRoot', root);
    project.provide('skillsBin', join(pkgDir, pkg.bin['afc-skills']));
    project.provide('installDir', installDir);
    project.provide('tarball', tarball);
    project.provide('npmCache', npmCache);
  } catch (error) {
    if (!process.env.SKILLS_E2E_KEEP) await rm(root, { recursive: true, force: true });
    throw error;
  }
  return async () => {
    if (process.env.SKILLS_E2E_KEEP) console.log(`Keeping e2e scratch dir: ${root}`);
    else await rm(root, { recursive: true, force: true });
  };
}
