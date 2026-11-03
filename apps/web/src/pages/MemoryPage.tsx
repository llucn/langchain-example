import type { AdminMemory, Memory } from '@app/shared';
import { MEMORY_MAX_LENGTH } from '@app/shared';
import { Button, EmptyState, Input, Modal, Skeleton } from '@techconnect/design-system';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthProvider';
import {
  addMemory,
  deleteAnyMemory,
  deleteMemory,
  editAnyMemory,
  editMemory,
  listAllMemories,
  listMemories,
} from '../lib/memory';
import { draftProblem, pageCount } from '../lib/memoryView';

const PAGE_SIZE = 50;
const FILTER_DELAY_MS = 300;

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

type Row = Memory & Partial<Pick<AdminMemory, 'ownerEmail'>>;

export function MemoryPage() {
  const auth = useAuth();
  if (auth.loading || (auth.enabled && auth.user && !auth.adminKnown)) return <Skeleton />;
  if (auth.enabled && !auth.user) return <p>Please sign in.</p>;
  return <MemoryList admin={auth.isAdmin} />;
}

function MemoryList({ admin }: { admin: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [emailQuery, setEmailQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  // The filter is sent after a short pause in typing, and restarts at page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setEmailQuery(email);
      setPage(1);
    }, FILTER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [email]);

  const load = useCallback(async () => {
    try {
      if (admin) {
        const result = await listAllMemories(emailQuery, page, PAGE_SIZE);
        setRows(result.items);
        setTotal(result.total);
      } else {
        const own = await listMemories();
        setRows(own);
        setTotal(own.length);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [admin, emailQuery, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (await run(() => addMemory(draft))) {
      setDraft('');
      setAdding(false);
    }
  };
  const saveEdit = async () => {
    if (!editing) return;
    const edit = admin ? editAnyMemory : editMemory;
    if (await run(() => edit(editing.id, editing.text))) setEditing(null);
  };
  const confirmDelete = async () => {
    if (!toDelete) return;
    const remove = admin ? deleteAnyMemory : deleteMemory;
    if (await run(() => remove(toDelete.id))) setToDelete(null);
  };

  const draftError = draft ? draftProblem(draft) : null;
  const pages = pageCount(total, PAGE_SIZE);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {admin && (
          <div style={{ minWidth: 260 }}>
            <Input
              label="Filter by email"
              placeholder="alice@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}
        <Button style={{ marginLeft: 'auto' }} onClick={() => setAdding(true)}>
          Add memory
        </Button>
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--red)' }}>
          Error: {error}
        </p>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Input
              label="New memory"
              value={draft}
              maxLength={MEMORY_MAX_LENGTH * 4}
              helpText={draftError ?? `Up to ${MEMORY_MAX_LENGTH} characters`}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button
            onClick={() => void add()}
            loading={busy}
            disabled={!draft || draftError !== null}
          >
            Save
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setAdding(false);
              setDraft('');
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      {!rows && !error && <Skeleton />}
      {rows && rows.length === 0 && (
        <EmptyState
          title={emailQuery ? 'No memories match' : 'No memories yet'}
          description={
            emailQuery
              ? 'No memory belongs to a user whose email contains that text.'
              : 'Agents remember durable facts and preferences you share, such as your usual building or language, and use them in later chats. You can also add your own.'
          }
        />
      )}
      {rows && rows.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          {rows.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'var(--card)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                {editing?.id === m.id ? (
                  <Input
                    label="Edit memory"
                    value={editing.text}
                    helpText={draftProblem(editing.text) ?? undefined}
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                  />
                ) : (
                  <span style={{ overflowWrap: 'anywhere' }}>{m.content}</span>
                )}
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
                  {admin && <span>{m.ownerEmail ?? 'unknown email'} · </span>}
                  {m.source === 'agent' ? 'Saved by the assistant' : 'Added by the user'} ·{' '}
                  {formatTime(m.updatedAt)}
                </div>
              </div>
              {editing?.id === m.id ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => void saveEdit()}
                    loading={busy}
                    disabled={draftProblem(editing.text) !== null}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing({ id: m.id, text: m.content })}
                  >
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setToDelete(m)}>
                    Delete
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {admin && pages > 1 && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Page {page} of {pages} · {total} memories
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Modal
        open={toDelete !== null}
        onClose={() => !busy && setToDelete(null)}
        title="Delete memory?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setToDelete(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmDelete()} loading={busy}>
              Delete
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>“{toDelete?.content}” will be forgotten.</p>
      </Modal>
    </div>
  );
}
