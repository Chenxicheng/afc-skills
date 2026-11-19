import { defineConfig } from 'vitest/config';

const source = process.env.SKILLS_E2E_ENTERPRISE_SOURCE;
const skill = process.env.SKILLS_E2E_ENTERPRISE_SKILL;
if (!source || !skill)
  throw new Error(
    'Enterprise E2E requires SKILLS_E2E_ENTERPRISE_SOURCE (HTTPS corporate repository URL) and SKILLS_E2E_ENTERPRISE_SKILL. No live verification was performed.'
  );
const url = new URL(source);
if (
  url.protocol !== 'https:' ||
  url.hostname !== 'code.sdsdev.co.kr' ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  url.port
)
  throw new Error(
    'Enterprise E2E fixture must be an uncredentialed HTTPS URL on code.sdsdev.co.kr.'
  );
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['enterprise.e2e.ts'],
    globalSetup: ['./setup.ts'],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    retry: 0,
    maxWorkers: 1,
  },
});
