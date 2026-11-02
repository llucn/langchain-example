import type { SettingOrigin, SettingsRefs, SettingsView, UpdateSettingsRequest } from '@app/shared';

export type PlainKey = keyof SettingsView['settings'];

export interface SettingsForm {
  values: Record<PlainKey, string>;
  /** Fields to return to the environment value. */
  reset: Partial<Record<PlainKey, boolean>>;
  token: string;
  clearToken: boolean;
}

export const PLAIN_KEYS: PlainKey[] = [
  'CONFIG_GITHUB_API_URL',
  'CONFIG_SOURCE',
  'CONFIG_REF',
  'EVOLUTION_MODEL',
  'EVOLUTION_MAX_TOKENS',
];

export const formFrom = (view: SettingsView): SettingsForm => ({
  values: Object.fromEntries(
    PLAIN_KEYS.map((k) => [
      k,
      view.settings[k].value === undefined ? '' : String(view.settings[k].value),
    ]),
  ) as Record<PlainKey, string>,
  reset: {},
  token: '',
  clearToken: false,
});

/** Only what differs from the view; an empty token means "unchanged". */
export function buildPatch(view: SettingsView, form: SettingsForm): UpdateSettingsRequest {
  const values: NonNullable<UpdateSettingsRequest['values']> = {};
  for (const key of PLAIN_KEYS) {
    if (form.reset[key]) {
      if (view.settings[key].origin === 'stored') values[key] = null;
      continue;
    }
    const before = view.settings[key].value === undefined ? '' : String(view.settings[key].value);
    if (form.values[key] !== before) values[key] = form.values[key];
  }
  const patch: UpdateSettingsRequest = {};
  if (Object.keys(values).length) patch.values = values;
  if (form.clearToken) patch.clearGithubToken = true;
  else if (form.token.trim()) patch.githubToken = form.token;
  return patch;
}

export const isChanged = (patch: UpdateSettingsRequest) => Object.keys(patch).length > 0;

export const originLabel = (origin: SettingOrigin) =>
  origin === 'stored' ? 'Stored' : origin === 'environment' ? 'Environment' : 'Default';

/** Options of the ref dropdown; the current ref stays selectable when GitHub does not list it. */
export function refChoices(refs: SettingsRefs | null, current: string) {
  const branches = refs?.branches ?? [];
  const tags = refs?.tags ?? [];
  const listed = branches.includes(current) || tags.includes(current);
  return { branches, tags, extra: current && !listed ? current : null };
}
