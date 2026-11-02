import { UnprocessableEntityException } from '@nestjs/common';
import { SettingsAdminService } from './settings.admin.service';
import { SettingsService } from './settings.service';
import type { AppEnv } from '../config/env';
import { sampleAgentConfig } from '../agent-config/sample-config';

const env = {
  settings: {},
  evolution: { model: 'm', maxTokens: 8192 },
  agentConfig: { source: '/tmp/x', ref: 'main', githubToken: 'secret-token' },
} as AppEnv;

describe('SettingsAdminService', () => {
  const svc = () => {
    const settings = new SettingsService(env, { find: async () => [] } as never, {});
    return new SettingsAdminService(settings, sampleAgentConfig(), {} as never, {} as never);
  };

  it('never returns the token', () => {
    const view = svc().view();
    expect(JSON.stringify(view)).not.toContain('secret-token');
    expect(view.githubToken).toEqual({ set: true, origin: 'environment' });
    expect(view.tokenStorageAvailable).toBe(false);
  });

  it('reports no refs for a local source', async () => {
    await expect(svc().refs({ source: '/some/dir' })).resolves.toEqual({
      local: true,
      branches: [],
      tags: [],
    });
  });

  it('rejects a source that is not valid', async () => {
    await expect(svc().refs({ source: 'http://github.com/o/r' })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });
});
