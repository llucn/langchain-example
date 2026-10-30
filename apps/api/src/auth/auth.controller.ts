import { Controller, Get, Inject, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserProfile } from '@app/shared';
import { APP_ENV, type AppEnv } from '../config/env';
import { isAdmin } from './roles.guard';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user from the validated OIDC token' })
  me(@Req() req: { user?: Record<string, unknown> }): UserProfile | { sub: null; isAdmin: true } {
    const u = req.user;
    if (!u) return { sub: null, isAdmin: true }; // AUTH_ENABLED=false
    return {
      sub: u.sub as string,
      email: u.email as string | undefined,
      username: (u['cognito:username'] ?? u.username) as string | undefined,
      groups: u['cognito:groups'] as string[] | undefined,
      isAdmin: isAdmin(u, this.env.auth.adminGroup),
    };
  }
}
