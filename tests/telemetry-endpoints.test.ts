import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAuditData, flushTelemetry, track } from '../src/telemetry.ts';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('intranet telemetry and audit policy', () => {
  it.each(['', '0', '1'])(
    'never sends telemetry or audit data with disable flags set to %j',
    async (value) => {
      vi.stubEnv('DO_NOT_TRACK', value);
      vi.stubEnv('DISABLE_TELEMETRY', value);
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      track({ event: 'install', source: 'internal/private', skills: 'secret', agents: 'aipro' });
      track({ event: 'find', query: 'sensitive query', resultCount: '0' });
      expect(await fetchAuditData('internal/private', ['secret'])).toBeNull();
      await flushTelemetry(1);
      expect(fetch).not.toHaveBeenCalled();
    }
  );
  it('does not allocate request or exit timers even if the network would hang', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetch);
    track({ event: 'remove', source: 'internal/private', skills: 'secret', agents: 'aipro' });
    await flushTelemetry(5000);
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
