import { defineConfig } from 'vitest/config';

// The default suite tests a real installed tarball without remote services.
// Historical public-network contracts are documented in legacy/README.md.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['package.e2e.ts', 'intranet.e2e.ts'],
    globalSetup: ['./setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 300_000,
    retry: 0,
    maxWorkers: 2,
  },
});
