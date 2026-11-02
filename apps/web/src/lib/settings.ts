import type {
  SettingsRefs,
  SettingsRefsRequest,
  SettingsView,
  UpdateSettingsRequest,
} from '@app/shared';
import { apiFetch, apiRequest } from './api';

const BASE = '/admin/settings';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/** The API's reason for a refusal (422 carries the validation or source error), else the status. */
async function failure(res: Response): Promise<Error> {
  let reason = `${res.status} ${res.statusText}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) reason = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  } catch {
    // keep the status text
  }
  return new Error(reason);
}

export const getSettings = () => apiFetch<SettingsView>(BASE);

export async function saveSettings(body: UpdateSettingsRequest): Promise<SettingsView> {
  const res = await apiRequest(BASE, {
    method: 'PUT',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as SettingsView;
}

export async function getRefs(body: SettingsRefsRequest): Promise<SettingsRefs> {
  const res = await apiRequest(`${BASE}/refs`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as SettingsRefs;
}
