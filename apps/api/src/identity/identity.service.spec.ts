import { describe, expect, it, vi } from 'vitest';
import { IdentityService, normalizeEmail } from './identity.service.js';

describe('identity service', () => {
  it('normalizes email and does not expose password hashes', async () => {
    const users = {
      findOne: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
      create: vi.fn().mockResolvedValue({
        _id: { toString: () => '507f1f77bcf86cd799439011' },
        email: 'student@example.test',
        displayName: 'Sinh viên',
        role: 'student',
        passwordHash: 'secret-hash'
      })
    };
    const service = new IdentityService(
      users as never,
      { create: vi.fn() } as never,
      { hash: vi.fn().mockResolvedValue('hash') } as never,
      {
        newRefreshToken: vi.fn().mockReturnValue('refresh'),
        hashRefreshToken: vi.fn().mockReturnValue('digest'),
        refreshExpiry: vi.fn().mockReturnValue(new Date()),
        accessToken: vi.fn().mockResolvedValue('access')
      } as never
    );

    expect(normalizeEmail(' Student@Example.Test ')).toBe('student@example.test');
    await expect(
      service.register({
        email: ' Student@Example.Test ',
        password: 'correct horse battery staple',
        displayName: 'Sinh viên'
      })
    ).resolves.toMatchObject({
      accessToken: 'access',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'student@example.test',
        displayName: 'Sinh viên',
        role: 'student'
      }
    });
  });

  it('uses one indistinguishable login error for unknown users and wrong passwords', async () => {
    const users = { findOne: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(null) }) };
    const service = new IdentityService(
      users as never,
      {} as never,
      { verify: vi.fn() } as never,
      {} as never
    );
    await expect(
      service.login({ email: 'missing@example.test', password: 'wrong' })
    ).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.'
    });
  });
  it('releases a rotation lease after a post-lock failure so the original session can retry', async () => {
    const old = { _id: 'session-id', userId: { toString: () => 'user-id' } };
    const user = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      email: 'student@example.test',
      displayName: 'Sinh viên',
      role: 'student'
    };
    const sessions = {
      findOneAndUpdate: vi.fn().mockResolvedValue(old),
      updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
      create: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockResolvedValue({})
    };
    const users = { findById: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(user) };
    const tokens = {
      hashRefreshToken: vi.fn((token: string) => `hash-${token}`),
      newRefreshToken: vi.fn().mockReturnValue('replacement'),
      accessToken: vi.fn().mockResolvedValue('access'),
      refreshExpiry: vi.fn().mockReturnValue(new Date())
    };
    const service = new IdentityService(
      users as never,
      sessions as never,
      {} as never,
      tokens as never
    );
    await expect(service.refresh('original')).rejects.toMatchObject({ status: 401 });
    await expect(service.refresh('original')).resolves.toMatchObject({ accessToken: 'access' });
    expect(sessions.create).toHaveBeenCalledTimes(1);
    expect(sessions.updateOne).toHaveBeenCalled();
  });
  it.each([
    ['pre-commit failure', { revokedAt: undefined, replacedByHash: undefined }, false],
    ['lost acknowledgement', { revokedAt: new Date(), replacedByHash: 'hash-replacement' }, true]
  ])('reconciles %s without leaving two usable sessions', async (_name, probe, succeeds) => {
    const old = { _id: 'session-id', userId: 'user-id' };
    const user = {
      _id: { toString: () => '507f1f77bcf86cd799439011' },
      email: 'student@example.test',
      displayName: 'Sinh viên',
      role: 'student'
    };
    const sessions = {
      findOneAndUpdate: vi.fn().mockResolvedValue(old),
      create: vi.fn().mockResolvedValue({}),
      updateOne: vi
        .fn()
        .mockRejectedValueOnce(new Error('write acknowledgement lost'))
        .mockResolvedValue({ modifiedCount: 1 }),
      deleteOne: vi.fn().mockResolvedValue({}),
      findById: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue({ ...probe, rotationLockHash: 'ignored' })
      })
    };
    const tokens = {
      hashRefreshToken: vi.fn((token: string) => `hash-${token}`),
      newRefreshToken: vi.fn().mockReturnValue('replacement'),
      accessToken: vi.fn().mockResolvedValue('access'),
      refreshExpiry: vi.fn().mockReturnValue(new Date())
    };
    const service = new IdentityService(
      { findById: vi.fn().mockResolvedValue(user) } as never,
      sessions as never,
      {} as never,
      tokens as never
    );
    const result = service.refresh('original');
    if (succeeds) await expect(result).resolves.toMatchObject({ refreshToken: 'replacement' });
    else await expect(result).rejects.toThrow('write acknowledgement lost');
    expect(sessions.deleteOne).toHaveBeenCalledTimes(succeeds ? 0 : 1);
  });
});
