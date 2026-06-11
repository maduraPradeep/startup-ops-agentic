import { describe, expect, it, vi } from 'vitest';
import { InMemoryTokenDenylist } from '../services/token-denylist';

// Phase 1b — token revocation denylist (spec §11.1). Exercised against the in-memory impl;
// the Redis impl is a thin SET/EX/EXISTS wrapper over the same contract.

describe('InMemoryTokenDenylist', () => {
  it('is not denied before deny()', async () => {
    const dl = new InMemoryTokenDenylist();
    expect(await dl.isDenied('sess-1')).toBe(false);
  });

  it('denies a key for its TTL', async () => {
    const dl = new InMemoryTokenDenylist();
    await dl.deny('sess-1', 60);
    expect(await dl.isDenied('sess-1')).toBe(true);
    // Other keys remain allowed.
    expect(await dl.isDenied('sess-2')).toBe(false);
  });

  it('self-cleans once the TTL elapses', async () => {
    vi.useFakeTimers();
    try {
      const dl = new InMemoryTokenDenylist();
      await dl.deny('sess-1', 30);
      expect(await dl.isDenied('sess-1')).toBe(true);
      vi.advanceTimersByTime(31_000);
      expect(await dl.isDenied('sess-1')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('treats a non-positive TTL as a no-op (token already expired)', async () => {
    const dl = new InMemoryTokenDenylist();
    await dl.deny('sess-1', 0);
    await dl.deny('sess-2', -10);
    expect(await dl.isDenied('sess-1')).toBe(false);
    expect(await dl.isDenied('sess-2')).toBe(false);
  });
});
