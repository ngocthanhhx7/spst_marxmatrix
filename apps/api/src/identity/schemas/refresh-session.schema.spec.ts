import { describe, expect, it } from 'vitest';
import { RefreshSessionSchema } from './refresh-session.schema.js';

describe('RefreshSession schema', () => {
  it('indexes active-session revocation lookups', () => {
    expect(RefreshSessionSchema.indexes()).toContainEqual([
      { tokenHash: 1, revokedAt: 1, expiresAt: 1 },
      {}
    ]);
  });
});
