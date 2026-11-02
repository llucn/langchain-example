import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  SettingKey,
  SettingsRefs,
  SettingsRefsRequest,
  SettingsView,
  UpdateSettingsRequest,
} from '@app/shared';
import type Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { AgentConfigError, ConfigSourceError } from '../agent-config/agent-config.error';
import { loadAgentConfig } from '../agent-config/agent-config.loader';
import { AgentConfigService } from '../agent-config/agent-config.service';
import { GitHubClient } from '../agent-config/github';
import { redactor } from '../agent-config/redact';
import { parseSource } from '../agent-config/source';
import { TypeOrmSnapshotStore } from '../agent-config/snapshot.store';
import { LOCAL_TOOL_NAMES } from '../agent/tools';
import { AppSetting } from '../database/entities/app-setting.entity';
import { REDIS } from '../redis/redis.module';
import { SettingsService, SettingsValidationError } from './settings.service';

export const SETTINGS_CHANNEL = 'settings:changed';
/** Serialises saves across instances. */
const LOCK_ID = 7_251_001;
const POLL_MS = 60_000;

type AgentConfigEnv = SettingsService['effective']['agentConfig'];
const agentKey = (e: AgentConfigEnv) =>
  JSON.stringify([e.source, e.ref, e.githubToken, e.githubApiUrl]);

/** Applies settings changes: validation, loading of the new Agent Config, swap, broadcast. */
@Injectable()
export class SettingsAdminService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SettingsAdminService.name);
  private readonly instanceId = randomUUID();
  private loadedKey = '';
  private subscriber?: Redis;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly settings: SettingsService,
    private readonly config: AgentConfigService,
    private readonly dataSource: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  onModuleInit() {
    // The startup load used the effective values at this moment.
    this.loadedKey = agentKey(this.settings.effective.agentConfig);
    try {
      this.subscriber = this.redis.duplicate();
      this.subscriber.on('error', (err) =>
        this.logger.warn(`Settings notification channel: ${err.message}`),
      );
      this.subscriber.on('message', (_channel, from) => {
        if (from !== this.instanceId) void this.refresh();
      });
      this.subscriber.subscribe(SETTINGS_CHANNEL).catch((err) => this.logger.warn(err.message));
    } catch (err) {
      this.logger.warn(`Settings notifications are off: ${(err as Error).message}`);
    }
    this.timer = setInterval(() => void this.pollChanges(), POLL_MS);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.subscriber?.quit().catch(() => undefined);
  }

  view(): SettingsView {
    const { agentConfig: a, evolution: e, origins } = this.settings.effective;
    return {
      settings: {
        CONFIG_GITHUB_API_URL: { value: a.githubApiUrl, origin: origins.CONFIG_GITHUB_API_URL },
        CONFIG_SOURCE: { value: a.source, origin: origins.CONFIG_SOURCE },
        CONFIG_REF: { value: a.ref, origin: origins.CONFIG_REF },
        EVOLUTION_MODEL: { value: e.model, origin: origins.EVOLUTION_MODEL },
        EVOLUTION_MAX_TOKENS: { value: e.maxTokens, origin: origins.EVOLUTION_MAX_TOKENS },
      },
      githubToken: { set: Boolean(a.githubToken), origin: origins.CONFIG_GITHUB_TOKEN },
      tokenStorageAvailable: this.settings.box.available,
      config: {
        version: this.config.version,
        hash: this.config.hash,
        source: this.config.source,
      },
    };
  }

  /** Validates, verifies a changed Agent Config source, stores and applies; all or nothing. */
  async save(patch: UpdateSettingsRequest, by: string | null): Promise<SettingsView> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    let committed: AppSetting[] | undefined;
    let loaded: Awaited<ReturnType<typeof loadAgentConfig>> | undefined;
    let changed: SettingKey[] | undefined;
    let token: string | undefined;
    try {
      await runner.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
      const rows = await this.settings.readRows(runner.manager);
      const plan = this.settings.plan(patch, rows);
      token = plan.effective.agentConfig.githubToken;
      changed = plan.changed;
      if (plan.agentConfigChanged) {
        loaded = await loadAgentConfig({
          env: plan.effective.agentConfig,
          store: new TypeOrmSnapshotStore(this.dataSource),
          knownLocalTools: LOCAL_TOOL_NAMES,
          fallback: false,
        });
      }
      const repo = runner.manager.getRepository(AppSetting);
      const now = new Date();
      if (plan.upserts.length) {
        await repo.upsert(
          plan.upserts.map((u) => ({ ...u, updatedAt: now, updatedBy: by })),
          ['key'],
        );
      }
      if (plan.deletes.length) await repo.delete(plan.deletes);
      committed = await this.settings.readRows(runner.manager);
      await runner.commitTransaction();
    } catch (err) {
      await runner.rollbackTransaction().catch(() => undefined);
      throw this.toHttp(err, token);
    } finally {
      await runner.release();
    }

    this.settings.commit(committed);
    if (loaded) {
      this.config.replace(loaded);
      this.loadedKey = agentKey(this.settings.effective.agentConfig);
    }
    if (changed?.length) {
      // Names only: the token and other values stay out of the log.
      this.logger.log(`Settings changed by ${by ?? 'unknown'}: ${changed.join(', ')}`);
      this.redis
        .publish(SETTINGS_CHANNEL, this.instanceId)
        .catch((err) => this.logger.warn(`Could not notify other instances: ${err.message}`));
    }
    return this.view();
  }

  private toHttp(err: unknown, token: string | undefined): Error {
    const redact = redactor(token ?? this.settings.effective.agentConfig.githubToken);
    if (err instanceof SettingsValidationError) {
      return new UnprocessableEntityException({
        message: err.problems.join('; '),
        problems: err.problems,
      });
    }
    if (err instanceof AgentConfigError || err instanceof ConfigSourceError) {
      return new UnprocessableEntityException({
        message: redact(err.message),
        problems:
          err instanceof AgentConfigError ? err.problems.map(redact) : [redact(err.message)],
      });
    }
    return err as Error;
  }

  /** Branches and tags of the draft source, read with the draft token (else the one in effect). */
  async refs(req: SettingsRefsRequest): Promise<SettingsRefs> {
    const { agentConfig } = this.settings.effective;
    const token = req.token?.trim() || agentConfig.githubToken;
    const redact = redactor(token);
    let source;
    try {
      source = parseSource(req.source ?? '', req.apiUrl?.trim() || undefined);
    } catch (err) {
      throw new UnprocessableEntityException(redact((err as Error).message));
    }
    if (source.kind === 'local') return { local: true, branches: [], tags: [] };
    try {
      return { local: false, ...(await new GitHubClient(source, { token }).listRefs()) };
    } catch (err) {
      if (err instanceof ConfigSourceError) {
        throw new UnprocessableEntityException(redact(err.message));
      }
      throw err;
    }
  }

  /** Re-reads the stored settings (another instance changed them) and reloads the Agent Config. */
  async refresh(): Promise<void> {
    try {
      await this.settings.load();
      const effective = this.settings.effective.agentConfig;
      const key = agentKey(effective);
      if (key === this.loadedKey) return;
      const loaded = await loadAgentConfig({
        env: effective,
        store: new TypeOrmSnapshotStore(this.dataSource),
        knownLocalTools: LOCAL_TOOL_NAMES,
      });
      this.config.replace(loaded);
      this.loadedKey = key;
      this.logger.log(`Agent config refreshed: ${loaded.version} at ${loaded.hash}`);
    } catch (err) {
      const redact = redactor(this.settings.effective.agentConfig.githubToken);
      this.logger.error(
        `Settings refresh failed, keeping the current config: ${redact((err as Error).message)}`,
      );
    }
  }

  private async pollChanges() {
    try {
      const [row] = await this.dataSource
        .getRepository(AppSetting)
        .createQueryBuilder('s')
        .select('max(s."updatedAt")', 'max')
        .getRawMany<{ max: Date | null }>();
      const newest = row?.max ? new Date(row.max).getTime() : 0;
      if (newest !== this.settings.lastSeen) await this.refresh();
    } catch (err) {
      this.logger.warn(`Settings poll failed: ${(err as Error).message}`);
    }
  }
}
