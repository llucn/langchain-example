import { randomBytes } from 'node:crypto';
import type { Repository } from 'typeorm';
import type { AppEnv } from '../config/env';
import type { AppSetting } from '../database/entities/app-setting.entity';
import { SecretBox } from './secret-box';
import { SettingsService, SettingsValidationError } from './settings.service';

const KEY = randomBytes(32).toString('base64');

const makeEnv = (key: string | undefined = KEY): AppEnv =>
  ({
    settings: { encryptionKey: key },
    evolution: { model: 'claude-sonnet-5-5', maxTokens: 8192 },
    agentConfig: {
      source: 'https://github.com/o/r.git//cfg',
      ref: 'main',
      githubToken: 'env-token',
      githubApiUrl: undefined,
    },
  }) as AppEnv;

const row = (key: string, value: string, secret = false): AppSetting => ({
  key,
  value,
  secret,
  updatedAt: new Date(1000),
  updatedBy: 'a',
});

const make = (env = makeEnv(), rows: AppSetting[] = [], raw: NodeJS.ProcessEnv = {}) => {
  const svc = new SettingsService(
    env,
    { find: async () => rows } as unknown as Repository<AppSetting>,
    raw,
  );
  return { svc, env };
};

describe('SettingsService', () => {
  it('falls back to the environment and reports the origin', async () => {
    const { svc } = make(makeEnv(), [], { EVOLUTION_MODEL: 'x' });
    await svc.load();
    const e = svc.effective;
    expect(e.agentConfig.ref).toBe('main');
    expect(e.origins.CONFIG_REF).toBe('environment');
    expect(e.origins.EVOLUTION_MODEL).toBe('environment');
    expect(e.origins.EVOLUTION_MAX_TOKENS).toBe('default');
  });

  it('stored values win and update the live env in place', async () => {
    const { svc, env } = make(makeEnv(), [
      row('CONFIG_REF', 'v2'),
      row('EVOLUTION_MAX_TOKENS', '4000'),
    ]);
    const live = env.agentConfig;
    await svc.load();
    expect(env.agentConfig).toBe(live);
    expect(env.agentConfig.ref).toBe('v2');
    expect(env.evolution.maxTokens).toBe(4000);
    expect(svc.effective.origins.CONFIG_REF).toBe('stored');
  });

  it('decrypts a stored token and falls back when it cannot be read', async () => {
    const enc = new SecretBox(KEY).encrypt('stored-token');
    const ok = make(makeEnv(), [row('CONFIG_GITHUB_TOKEN', enc, true)]);
    await ok.svc.load();
    expect(ok.env.agentConfig.githubToken).toBe('stored-token');
    const bad = make(makeEnv(randomBytes(32).toString('base64')), [
      row('CONFIG_GITHUB_TOKEN', enc, true),
    ]);
    await bad.svc.load();
    expect(bad.env.agentConfig.githubToken).toBe('env-token');
  });

  it('plans a change and flags an Agent Config change', () => {
    const { svc } = make();
    const plan = svc.plan({ values: { CONFIG_REF: 'v2', EVOLUTION_MODEL: 'm' } }, []);
    expect(plan.upserts.map((u) => u.key).sort()).toEqual(['CONFIG_REF', 'EVOLUTION_MODEL']);
    expect(plan.agentConfigChanged).toBe(true);
    expect(plan.effective.agentConfig.ref).toBe('v2');
    const only = svc.plan({ values: { EVOLUTION_MAX_TOKENS: 1000 } }, []);
    expect(only.agentConfigChanged).toBe(false);
    expect(only.changed).toEqual(['EVOLUTION_MAX_TOKENS']);
  });

  it('ignores values equal to the one in effect', () => {
    const { svc } = make();
    const plan = svc.plan({ values: { CONFIG_REF: 'main', EVOLUTION_MAX_TOKENS: 8192 } }, []);
    expect(plan.upserts).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.agentConfigChanged).toBe(false);
  });

  it('resets to the environment value', () => {
    const { svc } = make();
    const plan = svc.plan({ values: { CONFIG_REF: null } }, [row('CONFIG_REF', 'v2')]);
    expect(plan.deletes).toEqual(['CONFIG_REF']);
    expect(plan.effective.agentConfig.ref).toBe('main');
    expect(plan.agentConfigChanged).toBe(true);
  });

  it.each([
    [{ EVOLUTION_MAX_TOKENS: 10 }, /EVOLUTION_MAX_TOKENS/],
    [{ EVOLUTION_MAX_TOKENS: 'abc' }, /EVOLUTION_MAX_TOKENS/],
    [{ EVOLUTION_MODEL: ' ' }, /EVOLUTION_MODEL/],
    [{ CONFIG_SOURCE: '' }, /CONFIG_SOURCE/],
    [{ CONFIG_GITHUB_API_URL: 'http://x' }, /https/],
    [{ CONFIG_GITHUB_API_URL: 'https://u:p@x' }, /https/],
    [{ NOPE: 'x' }, /not a setting/],
  ])('rejects invalid %j', (values, message) => {
    const { svc } = make();
    expect(() => svc.plan({ values: values as never }, [])).toThrow(SettingsValidationError);
    expect(() => svc.plan({ values: values as never }, [])).toThrow(message);
  });

  it('keeps the token when empty, stores it encrypted, clears it on request', () => {
    const { svc } = make();
    expect(svc.plan({ githubToken: '  ' }, []).upserts).toEqual([]);
    const plan = svc.plan({ githubToken: 'new-token' }, []);
    const [u] = plan.upserts;
    expect(u).toMatchObject({ key: 'CONFIG_GITHUB_TOKEN', secret: true });
    expect(u.value).not.toContain('new-token');
    expect(plan.effective.agentConfig.githubToken).toBe('new-token');
    const clear = svc.plan({ clearGithubToken: true }, [row('CONFIG_GITHUB_TOKEN', u.value, true)]);
    expect(clear.effective.agentConfig.githubToken).toBe('env-token');
  });

  it('refuses a token without an encryption key', () => {
    const { svc } = make(makeEnv(''));
    expect(() => svc.plan({ githubToken: 't' }, [])).toThrow(/SETTINGS_ENCRYPTION_KEY/);
    expect(() => svc.plan({ values: { CONFIG_REF: 'v2' } }, [])).not.toThrow();
  });
});
