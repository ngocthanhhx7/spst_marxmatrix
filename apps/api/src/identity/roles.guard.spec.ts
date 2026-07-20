import { describe, expect, it } from 'vitest';
import { RolesGuard } from './roles.guard.js';

describe('RolesGuard', () => {
  it('allows only roles declared by metadata', () => {
    const handler = () => undefined;
    const reflector = { getAllAndOverride: () => ['admin'] };
    const guard = new RolesGuard(reflector as never);
    const context = (role: 'student' | 'admin') => ({
      getHandler: () => handler,
      getClass: () => Object,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) })
    });
    expect(guard.canActivate(context('admin') as never)).toBe(true);
    expect(guard.canActivate(context('student') as never)).toBe(false);
  });
});
