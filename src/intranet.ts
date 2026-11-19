import { diagnostics } from './diagnostics.ts';

/** This distribution is intentionally restricted to the corporate GitHub. */
export const INTRANET_HOST = 'code.sdsdev.co.kr';

export function isIntranetMode(): boolean {
  return true;
}

export function rejectExternalSource(): never {
  // Do not include the rejected URL: it may contain credentials or query secrets.
  throw diagnostics.SKILLS_INVALID_OPTION_VALUE({
    option: 'Source',
    expected: `a local directory or an HTTPS/SSH repository on ${INTRANET_HOST} (intranet-only build)`,
  });
}

export function assertIntranetUrl(value: string, allowSsh = false): void {
  if (allowSsh && /^git@code\.sdsdev\.co\.kr:[^\s?#]+$/i.test(value)) return;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return rejectExternalSource();
  }
  // Local Git fixtures/repos use file URLs; never allow a remote/UNC file host.
  if (
    allowSsh &&
    url.protocol === 'file:' &&
    !url.host &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    !/%(?:2f|5c)/i.test(url.pathname) &&
    url.pathname.startsWith('/') &&
    !url.pathname.startsWith('//')
  )
    return;
  const https = url.protocol === 'https:' && !url.username && !url.password && !url.port;
  const ssh =
    allowSsh &&
    url.protocol === 'ssh:' &&
    url.username === 'git' &&
    !url.password &&
    (!url.port || url.port === '22');
  if (url.hostname !== INTRANET_HOST || (!https && !ssh) || url.search || url.hash) {
    rejectExternalSource();
  }
}

/** Redirects must never silently send a request (or headers) to another host. */
export async function intranetFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const target = String(url);
  assertIntranetUrl(target);
  const response = await fetch(target, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) rejectExternalSource();
  return response;
}
