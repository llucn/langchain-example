import { Logger } from '@nestjs/common';
import type { SettingKey, SettingOrigin, UpdateSettingsRequest } from '@app/shared';
import type { EntityManager, Repository } from 'typeorm';
import type { AppEnv } from '../config/env';
import { AppSetting } from '../database/entities/app-setting.entity';
import { SecretBox } from './secret-box';

export const TOKEN_KEY = 'CONFIG_GITHUB_TOKEN' satisfies SettingKey;
export const AGENT_CONFIG_KEYS: SettingKey[] = [
  'CONFIG_SOURCE',
  'CONFIG_REF',
  TOKEN_KEY,
  'CONFIG_GITHUB_API_URL',
];
const PLAIN_KEYS = [
  'CONFIG_GITHUB_API_URL',
  'CONFIG_SOURCE',
  'CONFIG_REF',
  'EVOLUTION_MODEL',
  'EVOLUTION_MAX_TOKENS',
] as const;

export const MIN_MAX_TOKENS = 256;
export const MAX_MAX_TOKENS = 200_000;

/** The submitted values are invalid; nothing was stored. */
export class SettingsValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('; '));
    this.name = 'SettingsValidationError';
  }
}

type AgentConfigEnv = AppEnv['agentConfig'];
type EvolutionEnv = AppEnv['evolution'];
type Row = Pick<AppSetting, 'value' | 'secret'>;
export type StoredRows = Map<string, Row>;

export interface Effective {
  agentConfig: AgentConfigEnv;
  evolution: EvolutionEnv;
  origins: Record<SettingKey, SettingOrigin>;
}

export interface SettingsPlan {
  upserts: { key: SettingKey; value: string; secret: boolean }[];
  deletes: SettingKey[];
  /** What the settings will be once the plan is stored. */
  effective: Effective;
  /** Keys whose effective value changes. */
  changed: SettingKey[];
  agentConfigChanged: boolean;
}

const isHttpsUrl = (v: string) => {
  try {
    const u = new URL(v);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
};

const valueOf = (e: Effective, key: SettingKey): string | number | undefined => {
  const values: Record<SettingKey, string | number | undefined> = {
    CONFIG_SOURCE: e.agentConfig.source,
    CONFIG_REF: e.agentConfig.ref,
    CONFIG_GITHUB_TOKEN: e.agentConfig.githubToken,
    CONFIG_GITHUB_API_URL: e.agentConfig.githubApiUrl,
    EVOLUTION_MODEL: e.evolution.model,
    EVOLUTION_MAX_TOKENS: e.evolution.maxTokens,
  };
  return values[key];
};

/**
 * Effective values of the runtime settings: stored override, else the environment, else the
 * default. The `agentConfig` and `evolution` blocks of the shared `AppEnv` are updated in place, so
 * code reading them at the point of use sees a change at once.
 */
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  private readonly base: { agentConfig: AgentConfigEnv; evolution: EvolutionEnv };
  readonly box: SecretBox;
  private rows: StoredRows = new Map();
  /** Newest `updatedAt` of the stored rows seen, to notice changes made by other instances. */
  lastSeen = 0;

  constructor(
    private readonly env: AppEnv,
    private readonly repo: Repository<AppSetting>,
    private readonly rawEnv: NodeJS.ProcessEnv = process.env,
  ) {
    this.base = { agentConfig: { ...env.agentConfig }, evolution: { ...env.evolution } };
    this.box = new SecretBox(env.settings.encryptionKey);
    if (env.settings.encryptionKey && !this.box.available) {
      this.logger.warn('SETTINGS_ENCRYPTION_KEY is not a base64 32-byte key; token storage is off');
    }
  }

  /** Reads the stored rows (an unreadable table counts as none) and applies them to the live env. */
  async load(): Promise<void> {
    let list: AppSetting[] = [];
    try {
      list = await this.repo.find();
    } catch (err) {
      this.logger.warn(
        `Stored settings unavailable, using the environment: ${(err as Error).message}`,
      );
    }
    this.commit(list);
  }

  readRows(manager: EntityManager): Promise<AppSetting[]> {
    return manager.getRepository(AppSetting).find();
  }

  /** Makes the given stored rows the current ones (after a load, or a committed save). */
  commit(list: AppSetting[]) {
    this.rows = new Map(list.map((r) => [r.key, { value: r.value, secret: r.secret }]));
    this.lastSeen = list.reduce((m, r) => Math.max(m, r.updatedAt.getTime()), 0);
    const e = this.resolve(this.rows);
    Object.assign(this.env.agentConfig, e.agentConfig);
    Object.assign(this.env.evolution, e.evolution);
  }

  get effective(): Effective {
    return this.resolve(this.rows);
  }

  private originOf(key: SettingKey, rows: StoredRows, envSet: boolean): SettingOrigin {
    return rows.has(key) ? 'stored' : envSet ? 'environment' : 'default';
  }

  private resolve(rows: StoredRows): Effective {
    const { agentConfig: a, evolution: v } = this.base;
    const text = (key: SettingKey) => rows.get(key)?.value;
    let token: string | undefined;
    const encrypted = text(TOKEN_KEY);
    if (encrypted !== undefined) {
      try {
        token = this.box.decrypt(encrypted);
      } catch (err) {
        this.logger.warn(
          `Stored CONFIG_GITHUB_TOKEN cannot be read (${(err as Error).message}); using the environment`,
        );
      }
    }
    const given = (name: string) => Boolean(this.rawEnv[name]?.trim());
    const maxTokens = Number(text('EVOLUTION_MAX_TOKENS'));
    const apiUrl = rows.has('CONFIG_GITHUB_API_URL')
      ? text('CONFIG_GITHUB_API_URL')
      : a.githubApiUrl;
    const origins: Record<SettingKey, SettingOrigin> = {
      CONFIG_SOURCE: this.originOf('CONFIG_SOURCE', rows, true),
      CONFIG_REF: this.originOf('CONFIG_REF', rows, true),
      CONFIG_GITHUB_TOKEN:
        token !== undefined ? 'stored' : a.githubToken ? 'environment' : 'default',
      CONFIG_GITHUB_API_URL: this.originOf('CONFIG_GITHUB_API_URL', rows, true),
      EVOLUTION_MODEL: this.originOf('EVOLUTION_MODEL', rows, given('EVOLUTION_MODEL')),
      EVOLUTION_MAX_TOKENS: this.originOf(
        'EVOLUTION_MAX_TOKENS',
        rows,
        given('EVOLUTION_MAX_TOKENS'),
      ),
    };
    return {
      agentConfig: {
        source: text('CONFIG_SOURCE')?.trim() || a.source,
        ref: text('CONFIG_REF')?.trim() || a.ref,
        githubToken: token ?? a.githubToken,
        githubApiUrl: apiUrl?.trim() || undefined,
      },
      evolution: {
        model: text('EVOLUTION_MODEL')?.trim() || v.model,
        maxTokens: rows.has('EVOLUTION_MAX_TOKENS') ? maxTokens : v.maxTokens,
      },
      origins,
    };
  }

  /** Validates a change request against the stored rows and works out what it would change. */
  plan(patch: UpdateSettingsRequest, stored: AppSetting[]): SettingsPlan {
    const current: StoredRows = new Map(
      stored.map((r) => [r.key, { value: r.value, secret: r.secret }]),
    );
    const before = this.resolve(current);
    const problems: string[] = [];
    const wanted: SettingsPlan['upserts'] = [];
    const resets: SettingKey[] = [];
    const values = (patch.values ?? {}) as Record<string, unknown>;

    for (const key of Object.keys(values)) {
      if (!(PLAIN_KEYS as readonly string[]).includes(key))
        problems.push(`${key} is not a setting`);
    }
    for (const key of PLAIN_KEYS) {
      if (!(key in values)) continue;
      const raw = values[key];
      if (raw === null) {
        resets.push(key);
        continue;
      }
      if (typeof raw !== 'string' && typeof raw !== 'number') {
        problems.push(`${key} must be a string or number`);
        continue;
      }
      const v = String(raw).trim();
      if (key === 'CONFIG_SOURCE' && (!v || v.length > 512)) {
        problems.push('CONFIG_SOURCE must be 1 to 512 characters');
      } else if (key === 'CONFIG_REF' && v.length > 255) {
        problems.push('CONFIG_REF is too long');
      } else if (key === 'CONFIG_GITHUB_API_URL' && v && !isHttpsUrl(v)) {
        problems.push('CONFIG_GITHUB_API_URL must be an https URL without credentials');
      } else if (key === 'EVOLUTION_MODEL' && (!v || v.length > 128)) {
        problems.push('EVOLUTION_MODEL must be 1 to 128 characters');
      } else if (
        key === 'EVOLUTION_MAX_TOKENS' &&
        (!/^\d+$/.test(v) || Number(v) < MIN_MAX_TOKENS || Number(v) > MAX_MAX_TOKENS)
      ) {
        problems.push(
          `EVOLUTION_MAX_TOKENS must be an integer from ${MIN_MAX_TOKENS} to ${MAX_MAX_TOKENS}`,
        );
      } else {
        wanted.push({ key, value: v, secret: false });
      }
    }

    const token = patch.githubToken?.trim();
    if (token && patch.clearGithubToken) {
      problems.push('Give a token or clear it, not both');
    } else if (token) {
      if (!this.box.available) {
        problems.push('Storing the token needs SETTINGS_ENCRYPTION_KEY (a base64 32-byte key)');
      } else if (/\s/.test(token) || token.length > 512) {
        problems.push('CONFIG_GITHUB_TOKEN is not a valid token');
      } else {
        wanted.push({ key: TOKEN_KEY, value: this.box.encrypt(token), secret: true });
      }
    } else if (patch.clearGithubToken) {
      resets.push(TOKEN_KEY);
    }
    if (problems.length) throw new SettingsValidationError(problems);

    // A value equal to the one already in effect (e.g. the unchanged form) creates no override.
    const upserts = wanted.filter((u) => {
      const had = current.get(u.key);
      if (u.secret) return true;
      if (had) return had.value !== u.value;
      const probe = new Map(current).set(u.key, { value: u.value, secret: false });
      return valueOf(this.resolve(probe), u.key) !== valueOf(before, u.key);
    });
    const deletes = resets.filter((k) => current.has(k));

    const after = new Map(current);
    for (const u of upserts) after.set(u.key, { value: u.value, secret: u.secret });
    for (const k of deletes) after.delete(k);
    const effective = this.resolve(after);
    const differs = (k: SettingKey) => valueOf(before, k) !== valueOf(effective, k);
    const touched = new Set<SettingKey>([...upserts.map((u) => u.key), ...deletes]);
    return {
      upserts,
      deletes,
      effective,
      changed: [...touched].filter(differs),
      agentConfigChanged: AGENT_CONFIG_KEYS.some(differs),
    };
  }
}
