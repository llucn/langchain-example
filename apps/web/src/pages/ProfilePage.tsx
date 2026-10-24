import type { UserProfile } from '@app/shared';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@techconnect/design-system';
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent>
        {auth.loading && <Skeleton />}
        {!auth.loading && auth.enabled && !auth.user && <p>Please sign in.</p>}
        {error && <p style={{ color: 'var(--red)' }}>Error: {error}</p>}
        {me && <pre style={{ fontFamily: 'var(--font-mono)', margin: 0 }}>{JSON.stringify(me, null, 2)}</pre>}
      </CardContent>
    </Card>
  );
}
