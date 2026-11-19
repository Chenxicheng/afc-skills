# Historical public-network E2E contracts

These retained upstream suites require GitHub.com, skills.sh, public npm,
Notion or arbitrary HTTP sources. Those behaviors are deliberately unsupported
by the intranet-only distribution. They are not silently skipped: the default
E2E configuration explicitly selects `package.e2e.ts` and `intranet.e2e.ts`.

Do not use these files to certify the enterprise build. Their applicable local
package/CLI/API lifecycle coverage is implemented in the default intranet suite.
Real corporate GitHub verification has a separate explicit command:
`pnpm test:e2e:enterprise`. Missing fixture configuration causes an error.
