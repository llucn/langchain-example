import {
  REVIEW_TAGS,
  type ChatLogMessage,
  type ChatLogReview,
  type ChatLogReviewState,
  type ChatLogSession,
  type ChatLogSessionDetail,
  type ReviewRating,
  type ReviewTag,
  type SaveChatLogReviewRequest,
} from '@app/shared';
import {
  Button,
  EmptyState,
  FilterSelect,
  Input,
  Pagination,
  Skeleton,
} from '@techconnect/design-system';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  deleteMessageReview,
  deleteSessionReview,
  getLogSession,
  listLogSessions,
  saveMessageReview,
  saveSessionReview,
} from '../lib/chatLog';
import { formatDuration, groupByTurn, prettyJson, reviewsOf, upsertReview } from '../lib/chatLogView';

const PAGE_SIZE = 20;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });

const TYPE_LABEL: Record<ChatLogMessage['type'], { label: string; color: string }> = {
  user_input: { label: 'User input', color: 'var(--blue)' },
  llm_tool_use: { label: 'LLM tool use', color: 'var(--purple)' },
  llm_end_turn: { label: 'LLM end turn', color: 'var(--green)' },
  agent_tool_result: { label: 'Agent tool result', color: 'var(--amber)' },
  run_error: { label: 'Run error', color: 'var(--red)' },
};

const RATING_FILTER = [
  { value: 'unreviewed', label: 'Unreviewed' },
  { value: 'good', label: 'Has Good' },
  { value: 'bad', label: 'Has Bad' },
];

const fieldStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--card2)',
  color: 'var(--text)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
};

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function LogReviewPage() {
  const auth = useAuth();
  if (auth.loading || (auth.enabled && auth.user && !auth.adminKnown)) return <Skeleton />;
  if (auth.enabled && !auth.user) return <p style={{ padding: 24 }}>Please sign in.</p>;
  if (!auth.isAdmin) {
    return (
      <EmptyState
        title="Not authorised"
        description="Log Review is only available to administrators."
      />
    );
  }
  return <LogReviewContent reviewerSub={auth.user?.profile.sub ?? 'anonymous'} />;
}

function LogReviewContent({ reviewerSub }: { reviewerSub: string }) {
  const [filters, setFilters] = useState({
    user: '',
    agent: '',
    appVersion: '',
    from: '',
    to: '',
    rating: '' as ChatLogReviewState | '',
  });
  const debounced = useDebounced(filters);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ChatLogSession[]>([]);
  const [total, setTotal] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<ChatLogSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [debounced]);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    listLogSessions({
      page,
      pageSize: PAGE_SIZE,
      user: debounced.user || undefined,
      agent: debounced.agent || undefined,
      appVersion: debounced.appVersion || undefined,
      from: debounced.from ? new Date(debounced.from).toISOString() : undefined,
      to: debounced.to ? new Date(`${debounced.to}T23:59:59.999`).toISOString() : undefined,
      rating: debounced.rating || undefined,
    })
      .then(
        (r) => {
          if (cancelled) return;
          setItems(r.items);
          setTotal(r.total);
        },
        (e: Error) => !cancelled && setError(e.message),
      )
      .finally(() => !cancelled && setListLoading(false));
    return () => {
      cancelled = true;
    };
  }, [page, debounced]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    getLogSession(selected)
      .then(
        (d) => !cancelled && setDetail(d),
        (e: Error) => !cancelled && setError(e.message),
      )
      .finally(() => !cancelled && setDetailLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  /** Applies a changed review list to the open session and to its row in the list. */
  function reviewsChanged(reviews: ChatLogReview[]) {
    setDetail((d) => (d ? { ...d, reviews } : d));
    setItems((list) =>
      list.map((s) =>
        s.id === selected
          ? {
              ...s,
              goodCount: reviews.filter((r) => r.rating === 'good').length,
              badCount: reviews.filter((r) => r.rating === 'bad').length,
            }
          : s,
      ),
    );
  }

  const set = (k: keyof typeof filters) => (v: string) => setFilters((f) => ({ ...f, [k]: v }));

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside
        style={{
          width: 360,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ padding: 12, display: 'grid', gap: 8 }}>
          <Input
            aria-label="User"
            placeholder="User (name or id)"
            value={filters.user}
            onChange={(e) => set('user')(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              aria-label="Agent"
              placeholder="Agent"
              value={filters.agent}
              onChange={(e) => set('agent')(e.target.value)}
            />
            <Input
              aria-label="App version"
              placeholder="App version"
              value={filters.appVersion}
              onChange={(e) => set('appVersion')(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              aria-label="From"
              type="date"
              value={filters.from}
              onChange={(e) => set('from')(e.target.value)}
            />
            <Input
              aria-label="To"
              type="date"
              value={filters.to}
              onChange={(e) => set('to')(e.target.value)}
            />
          </div>
          <FilterSelect
            value={filters.rating}
            onChange={set('rating')}
            options={RATING_FILTER}
            placeholder="Any review state"
          />
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', flex: 1 }}>
          {listLoading && <Skeleton />}
          {!listLoading && items.length === 0 && (
            <EmptyState title="No sessions" description="Nothing matches the filters." />
          )}
          {items.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  background: s.id === selected ? 'var(--accent-dim)' : 'transparent',
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.name ?? 'New chat'}
                  {s.deletedAt && (
                    <span style={{ color: 'var(--muted)', fontWeight: 400 }}> (deleted)</span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {s.userName ?? s.userSub ?? 'anonymous'} · {formatTime(s.startedAt)}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted2)', display: 'flex', gap: 8 }}>
                  <span>{s.eventCount} events</span>
                  <span>v{s.appVersion}</span>
                  <span style={{ color: 'var(--green)' }}>
                    <ThumbsUp size={11} /> {s.goodCount}
                  </span>
                  <span style={{ color: 'var(--red)' }}>
                    <ThumbsDown size={11} /> {s.badCount}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            limit={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>
      </aside>

      <section style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 24 }}>
        {error && <p style={{ color: 'var(--red)' }}>Error: {error}</p>}
        {!selected && (
          <EmptyState
            title="Select a session"
            description="Pick a logged chat session on the left."
          />
        )}
        {selected && detailLoading && <Skeleton />}
        {selected && !detailLoading && detail && (
          <SessionDetail
            detail={detail}
            reviewerSub={reviewerSub}
            onReviewsChange={reviewsChanged}
          />
        )}
      </section>
    </div>
  );
}

function SessionDetail({
  detail,
  reviewerSub,
  onReviewsChange,
}: {
  detail: ChatLogSessionDetail;
  reviewerSub: string;
  onReviewsChange: (reviews: ChatLogReview[]) => void;
}) {
  const { session, messages, reviews } = detail;
  const toolCallAgents = new Map(
    messages.flatMap((m) => (m.toolCalls ?? []).map((c) => [c.id, c.name] as const)),
  );

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
      <div
        style={{
          padding: 16,
          border: '1px solid var(--border)',
          borderRadius: 14,
          background: 'var(--card)',
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>
          {session.name ?? 'New chat'}
          {session.deletedAt && (
            <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
              {' '}
              (deleted {formatTime(session.deletedAt)})
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 10px' }}>
          {session.userName ?? session.userSub ?? 'anonymous'} · started{' '}
          {formatTime(session.startedAt)} · app v{session.appVersion} · {session.eventCount} events
          · {session.id}
        </div>
        <ReviewControl
          label="Session"
          messageLevel={false}
          reviews={reviewsOf(reviews, null)}
          reviewerSub={reviewerSub}
          onSave={async (req) =>
            onReviewsChange(upsertReview(reviews, await saveSessionReview(session.id, req)))
          }
          onRemove={async (id) => {
            await deleteSessionReview(session.id);
            onReviewsChange(reviews.filter((r) => r.id !== id));
          }}
        />
      </div>

      {groupByTurn(messages).map((turn, i) => (
        <div key={turn.turnId} style={{ display: 'grid', gap: 8 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--muted2)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Turn {i + 1}
          </div>
          {turn.events.map((m) => (
            <EventCard
              key={m.id}
              m={m}
              callName={m.toolCallId ? toolCallAgents.get(m.toolCallId) : undefined}
              reviews={reviews}
              reviewerSub={reviewerSub}
              onReviewsChange={onReviewsChange}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function EventCard({
  m,
  callName,
  reviews,
  reviewerSub,
  onReviewsChange,
}: {
  m: ChatLogMessage;
  callName?: string;
  reviews: ChatLogReview[];
  reviewerSub: string;
  onReviewsChange: (reviews: ChatLogReview[]) => void;
}) {
  const t = TYPE_LABEL[m.type];
  const long = m.content.length > 400;
  return (
    <div
      style={{
        padding: 12,
        border: '1px solid var(--border)',
        borderLeft: `4px solid ${t.color}`,
        borderRadius: 10,
        background: 'var(--card)',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          fontSize: 12,
          color: 'var(--muted)',
          marginBottom: 6,
        }}
      >
        <strong style={{ color: t.color }}>{t.label}</strong>
        <span>#{m.seq}</span>
        {m.agentName && (
          <span>
            {m.agentName}
            {m.agentConfigVersion && ` @ ${m.agentConfigVersion}`}
            {m.agentConfigHash && (
              <span title={m.agentConfigHash} style={{ fontFamily: 'var(--font-mono)' }}>
                {' '}
                ({m.agentConfigHash.slice(0, 7)})
              </span>
            )}
          </span>
        )}
        <span>{formatTime(m.createdAt)}</span>
        {m.durationMs !== null && <span>⏱ {formatDuration(m.durationMs)}</span>}
        {m.model && <span>{m.model}</span>}
        {m.status === 'error' && <span style={{ color: 'var(--red)' }}>error</span>}
        {m.truncated && <span>truncated</span>}
      </div>

      {m.thinking && (
        <details style={{ fontSize: 13, color: 'var(--muted2)', marginBottom: 6 }}>
          <summary style={{ cursor: 'pointer' }}>Thinking</summary>
          <pre style={preStyle}>{m.thinking}</pre>
        </details>
      )}

      {m.type === 'llm_tool_use' && m.content && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <span style={{ color: 'var(--muted)' }}>Text</span>
          <pre style={preStyle}>{m.content}</pre>
        </div>
      )}

      {m.toolCalls?.map((c) => (
        <div key={c.id} style={{ fontSize: 13, marginBottom: 6 }}>
          <details>
            <summary style={{ cursor: 'pointer' }}>
              <code>{c.name}</code>
              <span style={{ color: 'var(--muted)' }}> · {c.id}</span>
            </summary>
            <pre style={preStyle}>{JSON.stringify(c.args, null, 2)}</pre>
          </details>
        </div>
      ))}

      {m.type === 'agent_tool_result' ? (
        <details style={{ fontSize: 13, marginBottom: 4 }}>
          <summary style={{ cursor: 'pointer' }}>
            <code>{m.toolName ?? callName}</code>
            <span style={{ color: 'var(--muted)' }}> · {m.toolCallId}</span>
          </summary>
          <pre style={preStyle}>{prettyJson(m.content)}</pre>
        </details>
      ) : (
        m.type !== 'llm_tool_use' &&
        m.content &&
        (long ? (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>
              {m.content.slice(0, 120)}…
            </summary>
            <pre style={preStyle}>{m.content}</pre>
          </details>
        ) : (
          <pre style={preStyle}>{m.content}</pre>
        ))
      )}

      {Object.keys(m.metadata).length > 0 && (
        <details style={{ fontSize: 12, color: 'var(--muted)' }}>
          <summary style={{ cursor: 'pointer' }}>Metadata</summary>
          <pre style={preStyle}>{JSON.stringify(m.metadata, null, 2)}</pre>
        </details>
      )}

      {m.type !== 'user_input' && (
        <div style={{ marginTop: 8 }}>
          <ReviewControl
            label="Message"
            messageLevel
            reviews={reviewsOf(reviews, m.id)}
            reviewerSub={reviewerSub}
            onSave={async (req) =>
              onReviewsChange(upsertReview(reviews, await saveMessageReview(m.id, req)))
            }
            onRemove={async (id) => {
              await deleteMessageReview(m.id);
              onReviewsChange(reviews.filter((r) => r.id !== id));
            }}
          />
        </div>
      )}
    </div>
  );
}

const preStyle: CSSProperties = {
  margin: '4px 0 0',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
};

/** Good/Bad buttons for one target, the form for comment/tags (and expected result), and all reviews of it. */
function ReviewControl({
  label,
  messageLevel,
  reviews,
  reviewerSub,
  onSave,
  onRemove,
}: {
  label: string;
  messageLevel: boolean;
  reviews: ChatLogReview[];
  reviewerSub: string;
  onSave: (req: SaveChatLogReviewRequest) => Promise<void>;
  onRemove: (reviewId: string) => Promise<void>;
}) {
  const own = reviews.find((r) => r.reviewerType === 'human' && r.reviewerSub === reviewerSub);
  const [editing, setEditing] = useState<ReviewRating | null>(null);
  const [comment, setComment] = useState('');
  const [tags, setTags] = useState<ReviewTag[]>([]);
  const [expected, setExpected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(rating: ReviewRating) {
    setComment(own?.comment ?? '');
    setTags((own?.tags as ReviewTag[]) ?? []);
    setExpected(own?.expectedResult ?? '');
    setError(null);
    setEditing(rating);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = (rating: ReviewRating, withDetails: boolean) =>
    run(() =>
      onSave({
        rating,
        ...(withDetails
          ? {
              comment,
              tags,
              ...(messageLevel ? { expectedResult: expected } : {}),
            }
          : {}),
      }),
    );

  function click(rating: ReviewRating) {
    // A first Good needs no notes: one click saves it. Everything else opens the form.
    if (rating === 'good' && !own) void save('good', false);
    else open(rating);
  }

  const btn = (rating: ReviewRating) => {
    const active = (editing ?? own?.rating) === rating;
    const color = rating === 'good' ? 'var(--green)' : 'var(--red)';
    return (
      <Button
        size="sm"
        variant={active ? 'primary' : 'outline'}
        disabled={busy}
        aria-pressed={own?.rating === rating}
        aria-label={`${label}: ${rating === 'good' ? 'Good' : 'Bad'}`}
        onClick={() => click(rating)}
        style={active ? { background: color, borderColor: color, color: '#fff' } : undefined}
      >
        {rating === 'good' ? <ThumbsUp size={13} /> : <ThumbsDown size={13} />}{' '}
        {rating === 'good' ? 'Good' : 'Bad'}
      </Button>
    );
  };

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {btn('good')}
        {btn('bad')}
        {own && editing === null && (
          <Button size="sm" variant="ghost" onClick={() => open(own.rating)}>
            Edit note
          </Button>
        )}
        {error && <span style={{ color: 'var(--red)', fontSize: 12 }}>{error}</span>}
      </div>

      {editing && (
        <div
          style={{
            display: 'grid',
            gap: 8,
            padding: 10,
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--card2)',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {REVIEW_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setTags((t) => (t.includes(tag) ? t.filter((x) => x !== tag) : [...t, tag]))
                }
                aria-pressed={tags.includes(tag)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  cursor: 'pointer',
                  border: '1px solid var(--border-hi)',
                  color: tags.includes(tag) ? 'var(--accent-text)' : 'var(--text)',
                  background: tags.includes(tag) ? 'var(--accent)' : 'transparent',
                }}
              >
                {tag}
              </button>
            ))}
          </div>
          <textarea
            aria-label="Comment"
            placeholder="Comment"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            style={fieldStyle}
          />
          {messageLevel && (
            <textarea
              aria-label="Expected result"
              placeholder="Expected result (what the agent should have said or done)"
              rows={2}
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              style={fieldStyle}
            />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" loading={busy} onClick={() => void save(editing, true)}>
              Save
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </Button>
            {own && (
              <Button
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => void run(() => onRemove(own.id))}
              >
                Remove my review
              </Button>
            )}
          </div>
        </div>
      )}

      {reviews.map((r) => (
        <div
          key={r.id}
          style={{
            fontSize: 13,
            paddingLeft: 8,
            borderLeft: `3px solid ${r.rating === 'good' ? 'var(--green)' : 'var(--red)'}`,
          }}
        >
          <strong>{r.rating === 'good' ? 'Good' : 'Bad'}</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>
            {r.reviewerSub === reviewerSub ? 'you' : (r.reviewerName ?? r.reviewerSub)} ·{' '}
            {formatTime(r.updatedAt)}
            {r.reviewerType === 'llm' && ` · LLM ${r.evaluator ?? ''}`}
          </span>
          {r.tags.length > 0 && (
            <span style={{ color: 'var(--muted2)' }}> [{r.tags.join(', ')}]</span>
          )}
          {r.comment && <div>{r.comment}</div>}
          {r.expectedResult && (
            <div>
              <em>Expected:</em> {r.expectedResult}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
