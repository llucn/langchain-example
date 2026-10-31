import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Roles('admin')
class AdminOnly {
  handler() {}
}
class Open {
  handler() {}
}

const ctx = (cls: new () => { handler(): void }, user?: unknown) =>
  ({
    getHandler: () => cls.prototype.handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guard = (enabled: boolean, adminGroup = 'admin') =>
  new RolesGuard(new Reflector(), { auth: { enabled, adminGroup } } as never);

describe('RolesGuard', () => {
  it('lets admins in', () => {
    expect(guard(true).canActivate(ctx(AdminOnly, { 'cognito:groups': ['admin'] }))).toBe(true);
  });

  it('rejects non-admins with 403', () => {
    expect(() => guard(true).canActivate(ctx(AdminOnly, { 'cognito:groups': ['x'] }))).toThrow(
      ForbiddenException,
    );
    expect(() => guard(true).canActivate(ctx(AdminOnly, {}))).toThrow(ForbiddenException);
  });

  it('honours a custom admin group', () => {
    const g = guard(true, 'ops');
    expect(g.canActivate(ctx(AdminOnly, { 'cognito:groups': ['ops'] }))).toBe(true);
    expect(() => g.canActivate(ctx(AdminOnly, { 'cognito:groups': ['admin'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('is open when authentication is disabled', () => {
    expect(guard(false).canActivate(ctx(AdminOnly))).toBe(true);
  });

  it('ignores handlers without a role', () => {
    expect(guard(true).canActivate(ctx(Open, {}))).toBe(true);
  });
});
