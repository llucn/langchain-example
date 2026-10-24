import { Controller, Get, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserProfile } from '@app/shared';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  @Get('me')
  @ApiOperation({ summary: 'Current user from the validated OIDC token' })
  me(@Req() req: { user?: Record<string, unknown> }): UserProfile | { sub: null } {
    const u = req.user;
    if (!u) return { sub: null }; // AUTH_ENABLED=false
    return {
      sub: u.sub as string,
      email: u.email as string | undefined,
      username: (u['cognito:username'] ?? u.username) as string | undefined,
      groups: u['cognito:groups'] as string[] | undefined,
    };
  }
}
