import type { UserProfile } from '@app/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { apiFetch } from '../lib/api';

export function ProfilePage() {
  const auth = useAuth();
  const [me, setMe] = useState<UserProfile | { sub: null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading || (auth.enabled && !auth.user)) return;
    apiFetch<UserProfile>('/auth/me').then(setMe, (e: Error) => setError(e.message));
  }, [auth.loading, auth.enabled, auth.user]);

  if (auth.loading) return <p>Loading…</p>;
  if (auth.enabled && !auth.user) return <p>Please sign in.</p>;

  return (
    <section>
      <h1>Profile</h1>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {me && <pre>{JSON.stringify(me, null, 2)}</pre>}
    </section>
  );
}
