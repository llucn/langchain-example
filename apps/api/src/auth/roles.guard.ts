import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_ENV, AppEnv } from '../config/env';
import { ROLES } from './roles.decorator';

/** True when the token's `cognito:groups` contains the configured admin group. */
export const isAdmin = (user: Record<string, unknown> | undefined, adminGroup: string): boolean => {
  const groups = user?.['cognito:groups'];
  return Array.isArray(groups) && groups.includes(adminGroup);
};

/**
 * Enforces `@Roles('admin')`. Runs after JwtAuthGuard (which answers 401); open when
 * AUTH_ENABLED=false, like every other endpoint in local development.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[] | undefined>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles?.length || !this.env.auth.enabled) return true;
    const { user } = ctx.switchToHttp().getRequest();
    if (isAdmin(user, this.env.auth.adminGroup)) return true;
    throw new ForbiddenException();
  }
}
