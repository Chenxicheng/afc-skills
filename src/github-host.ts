import { INTRANET_HOST } from './intranet.ts';

const DEFAULT_GITHUB_HOST = INTRANET_HOST;

/**
 * Return the corporate GitHub host. External GH_HOST values are ignored.
 *
 * GH_HOST is expected to be a hostname, not a URL.
 * Invalid values fall back to the corporate host instead of being interpolated into
 * clone URLs.
 */
export function getGitHubHost(): string {
  const configuredHost = process.env.GH_HOST?.trim();
  if (!configuredHost) {
    return DEFAULT_GITHUB_HOST;
  }

  try {
    const parsed = new URL(`https://${configuredHost}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    ) {
      return DEFAULT_GITHUB_HOST;
    }
    return parsed.hostname === INTRANET_HOST ? parsed.hostname : DEFAULT_GITHUB_HOST;
  } catch {
    return DEFAULT_GITHUB_HOST;
  }
}

/** Whether a host is the approved GitHub Enterprise host. */
export function isGitHubHost(host: string): boolean {
  const normalizedHost = host.toLowerCase();
  return normalizedHost === INTRANET_HOST;
}
