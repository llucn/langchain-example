import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { APP_ENV, AppEnv } from '../config/env';
import { IS_PUBLIC } from './public.decorator';

/**
 * Verifies OIDC (AWS Cognito) JWTs: signature via the issuer's JWKS, `iss`,
 * and audience (`aud` on id tokens, `client_id` on access tokens).
 * Disabled when AUTH_ENABLED=false.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly jwks?: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {
    if (env.auth.enabled) {
      if (!env.auth.issuer || !env.auth.clientId) {
        throw new Error('AUTH_ENABLED=true requires OIDC_ISSUER and OIDC_CLIENT_ID');
      }
      this.jwks = createRemoteJWKSet(new URL(`${env.auth.issuer}/.well-known/jwks.json`));
    }
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.jwks) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedException();

    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.env.auth.issuer });
      const audience = (payload.aud as string | undefined) ?? (payload.client_id as string);
      if (audience !== this.env.auth.clientId) throw new Error('audience mismatch');
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
