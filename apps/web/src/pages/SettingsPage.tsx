import type { SettingsRefs, SettingsView } from '@app/shared';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
} from '@techconnect/design-system';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { getRefs, getSettings, saveSettings } from '../lib/settings';
import {
  buildPatch,
  formFrom,
  isChanged,
  originLabel,
  refChoices,
  type PlainKey,
  type SettingsForm,
} from '../lib/settingsView';

export function SettingsPage() {
  const auth = useAuth();
  if (auth.loading || (auth.enabled && auth.user && !auth.adminKnown)) return <Skeleton />;
  if (auth.enabled && !auth.user) return <p>Please sign in.</p>;
  if (!auth.isAdmin) {
    return (
      <EmptyState
        title="Not authorised"
        description="Settings are only available to administrators."
      />
    );
  }
  return <SettingsEditor />;
}

const hint = { fontSize: 12, color: 'var(--muted)' } as const;
const selectStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 8,
  background: 'var(--card2)',
  color: 'inherit',
  border: '1px solid var(--border, rgba(128,128,128,.4))',
} as const;

function Field({
  label,
  origin,
  children,
  onReset,
}: {
  label: string;
  origin?: SettingsView['githubToken']['origin'];
  children: ReactNode;
  onReset?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {children}
      <div style={{ ...hint, display: 'flex', gap: 12, alignItems: 'center' }}>
        <code>{label}</code>
        {origin && <span>{originLabel(origin)}</span>}
        {onReset && origin === 'stored' && (
          <button
            type="button"
            onClick={onReset}
            style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Use environment value
          </button>
        )}
      </div>
    </div>
  );
}

function SettingsEditor() {
  const [view, setView] = useState<SettingsView | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [refs, setRefs] = useState<SettingsRefs | null>(null);
  const [refsError, setRefsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings().then(
      (v) => {
        setView(v);
        setForm(formFrom(v));
      },
      (e: Error) => setError(e.message),
    );
  }, []);

  const source = form?.values.CONFIG_SOURCE;
  const apiUrl = form?.values.CONFIG_GITHUB_API_URL;
  const token = form?.token;
  // The refs depend on the draft source, API URL and token; reload when they settle.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      getRefs({ source, apiUrl, token }).then(
        (r) => {
          if (cancelled) return;
          setRefs(r);
          setRefsError(null);
        },
        (e: Error) => {
          if (cancelled) return;
          setRefs(null);
          setRefsError(e.message);
        },
      );
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [source, apiUrl, token]);

  if (error && !view) return <p style={{ color: 'var(--red)' }}>Error: {error}</p>;
  if (!view || !form) return <Skeleton />;

  const patch = buildPatch(view, form);
  const set = (key: PlainKey, value: string) =>
    setForm({
      ...form,
      values: { ...form.values, [key]: value },
      reset: { ...form.reset, [key]: false },
    });
  const reset = (key: PlainKey) => setForm({ ...form, reset: { ...form.reset, [key]: true } });
  const resetNote = (key: PlainKey) =>
    form.reset[key] ? 'Will use the environment value after saving' : undefined;

  const save = async () => {
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      const next = await saveSettings(patch);
      setView(next);
      setForm(formFrom(next));
      setDone(
        `Saved. Agent Config ${next.config.version} at ${next.config.hash.slice(0, 7)} is in use.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const choices = refChoices(refs, form.values.CONFIG_REF);
  const refDisabled = refs?.local === true;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <p style={hint}>
        Changes apply to the running API without a restart. A value stored here overrides the
        environment variable of the same name.
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--red)' }}>
          Error: {error}
        </p>
      )}
      {done && <p role="status">{done}</p>}

      <Card>
        <CardHeader>
          <CardTitle>GitHub connection</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="CONFIG_GITHUB_API_URL"
              origin={view.settings.CONFIG_GITHUB_API_URL.origin}
              onReset={() => reset('CONFIG_GITHUB_API_URL')}
            >
              <Input
                label="GitHub API URL"
                value={form.values.CONFIG_GITHUB_API_URL}
                helpText={
                  resetNote('CONFIG_GITHUB_API_URL') ??
                  'Only for GitHub Enterprise; empty derives it from the repository host'
                }
                onChange={(e) => set('CONFIG_GITHUB_API_URL', e.target.value)}
              />
            </Field>
            <Field label="CONFIG_GITHUB_TOKEN" origin={view.githubToken.origin}>
              <Input
                label="GitHub token"
                type="password"
                autoComplete="new-password"
                value={form.token}
                disabled={!view.tokenStorageAvailable || form.clearToken}
                placeholder={view.githubToken.set ? '•••••••• (set)' : 'Not set'}
                helpText={
                  view.tokenStorageAvailable
                    ? 'Leave empty to keep the current token'
                    : 'Storing a token needs SETTINGS_ENCRYPTION_KEY on the server'
                }
                onChange={(e) => setForm({ ...form, token: e.target.value })}
              />
              {view.tokenStorageAvailable && view.githubToken.origin === 'stored' && (
                <label style={hint}>
                  <input
                    type="checkbox"
                    checked={form.clearToken}
                    onChange={(e) => setForm({ ...form, clearToken: e.target.checked, token: '' })}
                  />{' '}
                  Remove the stored token (use the environment token, if any)
                </label>
              )}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agent Config source</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="CONFIG_SOURCE"
              origin={view.settings.CONFIG_SOURCE.origin}
              onReset={() => reset('CONFIG_SOURCE')}
            >
              <Input
                label="Repository"
                value={form.values.CONFIG_SOURCE}
                helpText={
                  resetNote('CONFIG_SOURCE') ??
                  'https://github.com/<owner>/<repo>.git//<folder>, or a local directory'
                }
                onChange={(e) => set('CONFIG_SOURCE', e.target.value)}
              />
            </Field>
            <Field
              label="CONFIG_REF"
              origin={view.settings.CONFIG_REF.origin}
              onReset={() => reset('CONFIG_REF')}
            >
              <label
                htmlFor="config-ref"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: 'var(--muted2)',
                }}
              >
                Branch or tag
              </label>
              <select
                id="config-ref"
                style={selectStyle}
                value={form.values.CONFIG_REF}
                disabled={refDisabled}
                onChange={(e) => set('CONFIG_REF', e.target.value)}
              >
                {choices.extra && <option value={choices.extra}>{choices.extra} (current)</option>}
                {!form.values.CONFIG_REF && <option value="">Select…</option>}
                {choices.branches.length > 0 && (
                  <optgroup label="Branches">
                    {choices.branches.map((b) => (
                      <option key={`b:${b}`} value={b}>
                        {b}
                      </option>
                    ))}
                  </optgroup>
                )}
                {choices.tags.length > 0 && (
                  <optgroup label="Tags">
                    {choices.tags.map((t) => (
                      <option key={`t:${t}`} value={t}>
                        {t}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              {refDisabled && <span style={hint}>A local directory has no branches or tags.</span>}
              {refsError && (
                <span role="alert" style={{ ...hint, color: 'var(--red)' }}>
                  Could not list branches and tags: {refsError}. Check the repository and token.
                </span>
              )}
              {resetNote('CONFIG_REF') && <span style={hint}>{resetNote('CONFIG_REF')}</span>}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Improvement agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Field
              label="EVOLUTION_MODEL"
              origin={view.settings.EVOLUTION_MODEL.origin}
              onReset={() => reset('EVOLUTION_MODEL')}
            >
              <Input
                label="Model"
                value={form.values.EVOLUTION_MODEL}
                helpText={resetNote('EVOLUTION_MODEL')}
                onChange={(e) => set('EVOLUTION_MODEL', e.target.value)}
              />
            </Field>
            <Field
              label="EVOLUTION_MAX_TOKENS"
              origin={view.settings.EVOLUTION_MAX_TOKENS.origin}
              onReset={() => reset('EVOLUTION_MAX_TOKENS')}
            >
              <Input
                label="Max tokens"
                inputMode="numeric"
                value={form.values.EVOLUTION_MAX_TOKENS}
                helpText={resetNote('EVOLUTION_MAX_TOKENS') ?? '256 to 200000'}
                onChange={(e) => set('EVOLUTION_MAX_TOKENS', e.target.value)}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <div>
        <Button onClick={save} disabled={saving || !isChanged(patch)}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  );
}
