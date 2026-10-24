import type { HealthResponse } from '@app/shared';
import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';

export function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<HealthResponse>('/health').then(setData, (e: Error) => setError(e.message));
  }, []);

  return (
    <section>
      <h1>API Health</h1>
      {error && <p style={{ color: 'crimson' }}>Error: {error}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      {!data && !error && <p>Loading…</p>}
    </section>
  );
}
