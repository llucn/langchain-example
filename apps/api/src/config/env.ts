import { config as loadDotenv } from 'dotenv';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Repo-root .env (shared with web). Existing process env (e.g. docker compose) wins.
loadDotenv({ path: resolve(__dirname, '../../../../.env'), quiet: true });

const bool = (v: string | undefined, def = false) =>
  v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(v.toLowerCase());

export interface AppEnv {
  nodeEnv: string;
  port: number;
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    sslRejectUnauthorized: boolean;
    sslCaPath?: string;
    migrationsRun: boolean;
  };
  redis: { host: string; port: number; password?: string; db: number; tls: boolean };
  auth: {
    enabled: boolean;
    issuer: string;
    clientId: string;
    /** Cognito group of admins. */ adminGroup: string;
  };
  /** Version recorded in chat logs. */
  app: { version: string };
  model: { baseUrl?: string; apiKey?: string };
  /** Model of the improvement agents (diagnosis and proposal); the connection is the agents'. */
  evolution: { model: string; maxTokens: number };
  /** Where the Agent Config comes from (see the `agent-config` capability). */
  agentConfig: {
    /** GitHub repository URL with optional `//sub-path`, or a local directory. */
    source?: string;
    /** Branch, tag or commit ID of the repository. */
    ref?: string;
    githubToken?: string;
    /** GitHub Enterprise API base; derived from the repository host when unset. */
    githubApiUrl?: string;
  };
}

/** `version` of apps/api/package.json (same relative path from src/config and dist/config). */
function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
    return typeof pkg.version === 'string' && pkg.version ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: Number(env.API_PORT ?? 3000),
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: Number(env.DB_PORT ?? 5432),
      name: env.DB_NAME ?? 'app',
      user: env.DB_USER ?? 'postgres',
      password: env.DB_PASSWORD ?? 'postgres',
      ssl: bool(env.DB_SSL),
      sslRejectUnauthorized: bool(env.DB_SSL_REJECT_UNAUTHORIZED, true),
      sslCaPath: env.DB_SSL_CA_PATH || undefined,
      migrationsRun: bool(env.DB_MIGRATIONS_RUN),
    },
    redis: {
      host: env.REDIS_HOST ?? 'localhost',
      port: Number(env.REDIS_PORT ?? 6379),
      password: env.REDIS_PASSWORD || undefined,
      db: Number(env.REDIS_DB ?? 0),
      tls: bool(env.REDIS_TLS),
    },
    auth: {
      enabled: bool(env.AUTH_ENABLED),
      issuer: env.OIDC_ISSUER ?? '',
      clientId: env.OIDC_CLIENT_ID ?? '',
      adminGroup: env.ADMIN_GROUP?.trim() || 'admin',
    },
    app: { version: env.APP_VERSION?.trim() || packageVersion() },
    model: {
      baseUrl: env.MODEL_BASE_URL || undefined,
      apiKey: env.MODEL_API_KEY || undefined,
    },
    evolution: {
      model: env.EVOLUTION_MODEL?.trim() || 'claude-sonnet-5-5',
      maxTokens: Number(env.EVOLUTION_MAX_TOKENS ?? 8192),
    },
    agentConfig: {
      source: env.CONFIG_SOURCE?.trim() || undefined,
      ref: env.CONFIG_REF?.trim() || undefined,
      githubToken: env.CONFIG_GITHUB_TOKEN?.trim() || undefined,
      githubApiUrl: env.CONFIG_GITHUB_API_URL?.trim() || undefined,
    },
  };
}

export const APP_ENV = 'APP_ENV';
