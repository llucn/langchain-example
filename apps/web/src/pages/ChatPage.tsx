import type { ChatMessage, ChatSession } from '@app/shared';
import { Button, EmptyState, Input, Skeleton } from '@techconnect/design-system';
import { Brain, Plus, Send } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import {
  createChatSession,
  listChatMessages,
  listChatSessions,
  sendChatMessage,
} from '../lib/chat';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ChatPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [thinking, setThinking] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // Session currently being written by send(); its messages are already local, skip the reload.
  const sendingTo = useRef<string | null>(null);

  const ready = !auth.loading && !(auth.enabled && !auth.user);

  const refreshSessions = useCallback(
    () => listChatSessions().then(setSessions, (e: Error) => setError(e.message)),
    [],
  );

  useEffect(() => {
    if (ready) void refreshSessions();
  }, [ready, refreshSessions]);

  useEffect(() => {
    if (sendingTo.current === sessionId) return;
    setError(null);
    setThinking(null);
    if (!ready || !sessionId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    listChatMessages(sessionId)
      .then(
        (m) => !cancelled && setMessages(m),
        (e: Error) => !cancelled && setError(e.message),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setDraft('');
    setSending(true);
    setError(null);
    try {
      let id = sessionId;
      if (!id) {
        id = (await createChatSession()).id;
        sendingTo.current = id;
        navigate(`/chat/${id}`);
      }
      sendingTo.current = id;
      await sendChatMessage(id, content, (ev) => {
        if (ev.type === 'user') {
          setMessages((m) => [...m, ev.message]);
          setThinking('');
        } else if (ev.type === 'thinking') {
          setThinking((t) => (t ?? '') + ev.delta);
        } else if (ev.type === 'assistant') {
          setThinking(null);
          setMessages((m) => [...m, ev.message]);
        }
      });
      void refreshSessions();
    } catch (err) {
      setError((err as Error).message);
      setThinking(null);
    } finally {
      sendingTo.current = null;
      setSending(false);
    }
  }

  if (auth.loading) return <Skeleton />;
  if (!ready) return <p style={{ padding: 24 }}>Please sign in.</p>;

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      <aside
        style={{
          width: 280,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ padding: 12 }}>
          <Button style={{ width: '100%' }} onClick={() => navigate('/chat')}>
            <Plus size={16} /> New chat
          </Button>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', flex: 1 }}>
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => navigate(`/chat/${s.id}`)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  border: 0,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  fontFamily: 'var(--font-body)',
                  background: s.id === sessionId ? 'var(--accent-dim)' : 'transparent',
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
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{formatTime(s.startedAt)}</div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {loading && <Skeleton />}
          {!loading && messages.length === 0 && thinking === null && (
            <EmptyState title="Start a conversation" description="Type a message below." />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
            {thinking !== null && <ThinkingBubble text={thinking} />}
          </div>
          {error && <p style={{ color: 'var(--red)' }}>Error: {error}</p>}
          <div ref={bottomRef} />
        </div>
        <form
          onSubmit={send}
          style={{
            display: 'flex',
            gap: 8,
            padding: 16,
            borderTop: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <div style={{ flex: 1 }}>
            <Input
              aria-label="Message"
              placeholder="Type a message…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              autoFocus
            />
          </div>
          <Button type="submit" disabled={sending || !draft.trim()}>
            <Send size={16} /> Send
          </Button>
        </form>
      </section>
    </div>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const mine = message.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: mine ? 'flex-end' : 'flex-start',
      }}
    >
      {!mine && message.thinking && <ThinkingBubble text={message.thinking} collapsed />}
      <div
        style={{
          maxWidth: '70%',
          padding: '10px 14px',
          borderRadius: 14,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          background: mine ? 'var(--accent)' : 'var(--card)',
          color: mine ? 'var(--accent-text)' : 'var(--text)',
          borderBottomRightRadius: mine ? 4 : 14,
          borderBottomLeftRadius: mine ? 14 : 4,
        }}
      >
        {message.content}
      </div>
      <span style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}

function ThinkingBubble({ text, collapsed = false }: { text: string; collapsed?: boolean }) {
  const body = (
    <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 }}>
      {text || '…'}
    </div>
  );
  return (
    <div
      style={{
        maxWidth: '70%',
        marginBottom: 6,
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px dashed var(--border-hi)',
        color: 'var(--muted2)',
        fontSize: 13,
        fontStyle: 'italic',
      }}
    >
      {collapsed ? (
        <details>
          <summary style={{ cursor: 'pointer' }}>
            <Brain size={13} style={{ verticalAlign: -2 }} /> Thinking
          </summary>
          {body}
        </details>
      ) : (
        <>
          <Brain size={13} style={{ verticalAlign: -2 }} /> Thinking…
          {body}
        </>
      )}
    </div>
  );
}
