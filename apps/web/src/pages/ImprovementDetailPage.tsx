import type { ImprovementProposal, ImprovementStatus } from '@app/shared';
import { Button, EmptyState, Skeleton } from '@techconnect/design-system';
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { discardImprovement, getImprovement } from '../lib/improvements';
import {
  LAYER_LABEL,
  canDiscard,
  diffLineKind,
  isGenerating,
  shortCommit,
} from '../lib/improvementView';

export const STATUS_COLOR: Record<ImprovementStatus, string> = {
  generating: 'var(--accent)',
  ready: 'var(--green)',
  failed: 'var(--red)',
  discarded: 'var(--muted)',
};

const LINE_COLOR = {
  add: 'var(--green)',
  del: 'var(--red)',
  hunk: 'var(--accent)',
  meta: 'var(--muted)',
  ctx: 'var(--text)',
} as const;

const box: CSSProperties = {
  padding: 16,
  border: '1px solid var(--border)',
  borderRadius: 14,
  background: 'var(--card)',
};
const pre: CSSProperties = {
  margin: '6px 0 0',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
};
const heading: CSSProperties = { fontSize: 14, fontWeight: 700, marginBottom: 6 };

export function ImprovementDetailPage() {
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
  return <Detail />;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

function Detail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<ImprovementProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await getImprovement(id);
        if (cancelled) return;
        setP(next);
        // Poll while the proposal is being generated.
        if (isGenerating(next.status)) timer = setTimeout(load, 2000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  if (error) return <p style={{ color: 'var(--red)' }}>Error: {error}</p>;
  if (!p) return <Skeleton />;

  async function discard() {
    if (!p) return;
    setBusy(true);
    try {
      await discardImprovement(p.id);
      setP(await getImprovement(p.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 960 }}>
      <div style={{ ...box, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" onClick={() => navigate('/improvements')}>
          ← All proposals
        </Button>
        <strong style={{ fontSize: 16 }}>{p.agentName}</strong>
        <span style={{ color: STATUS_COLOR[p.status] }}>
          {p.status}
          {isGenerating(p.status) && '…'}
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          base {shortCommit(p.baseCommit)} · {p.baseSource}
        </span>
        {canDiscard(p.status) && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={discard}
            style={{ marginLeft: 'auto' }}
          >
            Discard
          </Button>
        )}
      </div>

      {p.error && (
        <div style={{ ...box, color: 'var(--red)' }}>
          <div style={heading}>Error</div>
          <pre style={pre}>{p.error}</pre>
        </div>
      )}

      {p.cases.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={heading}>Diagnoses</div>
          {p.cases.map((c) => (
            <div key={c.id} style={box}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                Review {c.reviewId.slice(0, 8)} · event #{c.evidence.reviewedSeq} ·{' '}
                {c.evidence.agentName} @ {c.evidence.configVersion ?? '?'}
                {c.evidence.configHash && ` (${shortCommit(c.evidence.configHash)})`}
              </div>
              {c.evidence.review.comment && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Comment:</span>{' '}
                  {c.evidence.review.comment}
                </div>
              )}
              {c.evidence.review.expectedResult && (
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--muted)' }}>Expected:</span>{' '}
                  {c.evidence.review.expectedResult}
                </div>
              )}
              {c.diagnosis ? (
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <strong>{LAYER_LABEL[c.diagnosis.layer]}</strong>
                  <span style={{ color: 'var(--muted)' }}>
                    {' '}
                    · confidence {c.diagnosis.confidence.toFixed(2)}
                  </span>
                  <div>{c.diagnosis.rootCause}</div>
                  {c.diagnosis.evidence.length > 0 && (
                    <ul style={{ margin: '4px 0', paddingLeft: 18, color: 'var(--muted2)' }}>
                      {c.diagnosis.evidence.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                  <div style={{ color: 'var(--muted)' }}>
                    Suggested: {c.diagnosis.suggestedAction}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
                  Not diagnosed yet
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {p.notes.length > 0 && (
        <div style={box}>
          <div style={heading}>Notes</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
            {p.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {p.rationale && (
        <div style={box}>
          <div style={heading}>Rationale</div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{p.rationale}</div>
        </div>
      )}

      {p.diff && (
        <div style={box}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ ...heading, marginBottom: 0 }}>Diff</div>
            <CopyButton text={p.diff} label="Copy diff" />
          </div>
          <pre style={pre}>
            {p.diff.split('\n').map((line, i) => (
              <div key={i} style={{ color: LINE_COLOR[diffLineKind(line)] }}>
                {line || ' '}
              </div>
            ))}
          </pre>
        </div>
      )}

      {p.files.map((f) => (
        <details key={f.path} style={box}>
          <summary style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}>
            <code>{f.path}</code>
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>proposed text</span>
          </summary>
          <div style={{ margin: '8px 0' }}>
            <CopyButton text={f.proposed} label="Copy file" />
          </div>
          <pre style={pre}>{f.proposed}</pre>
        </details>
      ))}

      {p.status === 'ready' && !p.diff && p.notes.length === 0 && (
        <div style={{ ...box, color: 'var(--muted)' }}>No change proposed.</div>
      )}
    </div>
  );
}
