import type { ImprovementProposalSummary } from '@app/shared';
import { EmptyState, Skeleton } from '@techconnect/design-system';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { listImprovements } from '../lib/improvements';
import { isGenerating, shortCommit } from '../lib/improvementView';
import { STATUS_COLOR } from './ImprovementDetailPage';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ImprovementsPage() {
  const auth = useAuth();
  if (auth.loading || (auth.enabled && auth.user && !auth.adminKnown)) return <Skeleton />;
  if (auth.enabled && !auth.user) return <p>Please sign in.</p>;
  if (!auth.isAdmin) {
    return (
      <EmptyState
        title="Not authorised"
        description="Improvements are only available to administrators."
      />
    );
  }
  return <ImprovementsList />;
}

function ImprovementsList() {
  const [items, setItems] = useState<ImprovementProposalSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      listImprovements().then(
        (rows) => !cancelled && setItems(rows),
        (e: Error) => !cancelled && setError(e.message),
      );
    void load();
    // Refresh while something is still being generated.
    const timer = setInterval(() => {
      setItems((cur) => {
        if (cur?.some((p) => isGenerating(p.status))) void load();
        return cur;
      });
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (error) return <p style={{ color: 'var(--red)' }}>Error: {error}</p>;
  if (!items) return <Skeleton />;
  if (!items.length) {
    return (
      <EmptyState
        title="No improvement proposals"
        description="Select Bad message reviews on the Log Review page and click Generate improvement."
      />
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8, maxWidth: 900 }}>
      {items.map((p) => (
        <Link
          key={p.id}
          to={`/improvements/${p.id}`}
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            padding: '12px 16px',
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--card)',
            color: 'var(--text)',
            textDecoration: 'none',
          }}
        >
          <strong style={{ minWidth: 150 }}>{p.agentName}</strong>
          <span style={{ color: STATUS_COLOR[p.status], minWidth: 90 }}>{p.status}</span>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            {p.caseCount} case{p.caseCount === 1 ? '' : 's'} · {p.hasDiff ? 'diff' : 'notes only'} ·
            base {shortCommit(p.baseCommit)}
          </span>
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 12 }}>
            {p.createdByName ?? 'anonymous'} · {formatTime(p.createdAt)}
          </span>
        </Link>
      ))}
    </div>
  );
}
