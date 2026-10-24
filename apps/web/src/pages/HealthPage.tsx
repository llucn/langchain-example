import type { HealthResponse } from '@app/shared';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@techconnect/design-system';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HealthResponse>('/health').then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Health</CardTitle>
      </CardHeader>
      <CardContent>
        {error && <p style={{ color: 'var(--red)' }}>Error: {error}</p>}
        {data && <pre style={{ fontFamily: 'var(--font-mono)', margin: 0 }}>{JSON.stringify(data, null, 2)}</pre>}
        {!data && !error && <Skeleton />}
      </CardContent>
    </Card>
  );
}
