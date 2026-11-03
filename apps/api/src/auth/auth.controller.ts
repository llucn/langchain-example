import { Controller, Get, Inject, Logger, Req } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserProfile } from '@app/shared';
import { Repository } from 'typeorm';
import { APP_ENV, type AppEnv } from '../config/env';
import { User } from '../database/entities/user.entity';
import { isAdmin } from './roles.guard';
import { syncUser } from './user-sync';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Current user from the validated OIDC token' })
  async me(
    @Req() req: { user?: Record<string, unknown> },
  ): Promise<UserProfile | { sub: null; isAdmin: true }> {
    const u = req.user;
    if (!u) return { sub: null, isAdmin: true }; // AUTH_ENABLED=false
    // The web app calls this right after login: record the user (and email) for the admin views.
    try {
      await syncUser(this.users, u);
    } catch (err) {
      this.logger.error(err);
    }
    return {
      sub: u.sub as string,
      email: u.email as string | undefined,
      username: (u['cognito:username'] ?? u.username) as string | undefined,
      groups: u['cognito:groups'] as string[] | undefined,
      isAdmin: isAdmin(u, this.env.auth.adminGroup),
    };
  }
}
