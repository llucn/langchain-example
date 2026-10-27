import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

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
  auth: { enabled: boolean; issuer: string; clientId: string };
  model: { baseUrl?: string; apiKey?: string };
  /** Remote MCP servers by name; servers without a URL are omitted. */
  mcp: { servers: Record<string, string> };
}

/** MCP server name -> env variable holding its URL. */
export const MCP_SERVER_ENV = {
  user: 'MCP_USER_URL',
  asset: 'MCP_ASSET_URL',
  location: 'MCP_LOCATION_URL',
  work_order: 'MCP_WORK_ORDER_URL',
} as const;

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
    },
    model: {
      baseUrl: env.MODEL_BASE_URL || undefined,
      apiKey: env.MODEL_API_KEY || undefined,
    },
    mcp: {
      servers: Object.fromEntries(
        Object.entries(MCP_SERVER_ENV).flatMap(([name, key]) =>
          env[key]?.trim() ? [[name, env[key]!.trim()]] : [],
        ),
      ),
    },
  };
}

export const APP_ENV = 'APP_ENV';
