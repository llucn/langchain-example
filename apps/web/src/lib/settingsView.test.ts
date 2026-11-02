import type { SettingsView } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { buildPatch, formFrom, refChoices } from './settingsView';

const view: SettingsView = {
  settings: {
    CONFIG_GITHUB_API_URL: { origin: 'environment' },
    CONFIG_SOURCE: { value: 'https://github.com/o/r.git//cfg', origin: 'environment' },
    CONFIG_REF: { value: 'main', origin: 'stored' },
    EVOLUTION_MODEL: { value: 'm', origin: 'default' },
    EVOLUTION_MAX_TOKENS: { value: 8192, origin: 'default' },
  },
  githubToken: { set: true, origin: 'environment' },
  tokenStorageAvailable: true,
  config: { version: 'main', hash: 'h', source: 's' },
};

describe('buildPatch', () => {
  it('is empty for an untouched form', () => {
    expect(buildPatch(view, formFrom(view))).toEqual({});
  });

  it('sends changed fields only, and the token only when typed', () => {
    const form = formFrom(view);
    form.values.CONFIG_REF = 'v1.0';
    form.values.EVOLUTION_MAX_TOKENS = '4000';
    expect(buildPatch(view, form)).toEqual({
      values: { CONFIG_REF: 'v1.0', EVOLUTION_MAX_TOKENS: '4000' },
    });
    form.token = 'abc';
    expect(buildPatch(view, form).githubToken).toBe('abc');
    form.token = '   ';
    expect(buildPatch(view, form).githubToken).toBeUndefined();
  });

  it('resets only stored values and clears the token on request', () => {
    const form = formFrom(view);
    form.reset = { CONFIG_REF: true, CONFIG_SOURCE: true };
    form.clearToken = true;
    form.token = 'ignored';
    expect(buildPatch(view, form)).toEqual({
      values: { CONFIG_REF: null },
      clearGithubToken: true,
    });
  });
});

describe('refChoices', () => {
  const refs = { local: false, branches: ['main'], tags: ['v1'] };
  it('lists branches and tags', () => {
    expect(refChoices(refs, 'v1')).toEqual({ branches: ['main'], tags: ['v1'], extra: null });
  });
  it('keeps an unlisted current ref selectable', () => {
    expect(refChoices(refs, 'abc1234').extra).toBe('abc1234');
    expect(refChoices(null, 'main').extra).toBe('main');
    expect(refChoices(null, '').extra).toBeNull();
  });
});
