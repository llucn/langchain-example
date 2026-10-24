import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Bell, LogOut, Menu, Moon, Sun } from 'lucide-react';

const sectionLabelStyle: CSSProperties = {
  fontSize: '0.643rem',
  fontWeight: 700,
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  padding: '8px 12px 2px',
};

/**
 * Delta-style Topbar. All styling lives in .topbar / .topbar-* classes
 * in theme.css — this component just applies them.
 */
export interface TopbarProps {
  title: string;
  breadcrumb?: string;
  onBreadcrumbClick?: () => void;
  /** Content rendered inline right after the page title. */
  titleExtra?: ReactNode;
  actions?: ReactNode;
  onMenuClick?: () => void;
  user?: {
    name?: string;
    email?: string;
    /**
     * Primary role label shown first. Kept for back-compat; prefer passing
     * `roles` (the full list) which renders all assignments.
     */
    role?: string;
    /**
     * Full list of human-readable role labels. Rendered comma-separated in
     * the avatar dropdown so multi-role users see every assignment.
     */
    roles?: string[];
  };
  onSignOut?: () => void;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
  /** Always-visible notifications bell with unread badge. */
  notifications?: {
    count: number;
    onClick: () => void;
    label?: string;
  };
  /** In-dropdown language pill switcher. Omit to hide entirely. */
  language?: {
    label?: string;
    current: string;
    options: Array<{ code: string; label: string }>;
    onChange: (code: string) => void;
  };
  /** In-dropdown text size pill switcher. Omit to hide entirely. */
  textSize?: {
    label?: string;
    current: number;
    options: Array<{ value: number; label: string }>;
    onChange: (value: number) => void;
  };
  /** In-dropdown theme pill switcher. */
  themeOptions?: {
    label?: string;
    current: string;
    options: Array<{ id: string; label: string }>;
    onChange: (id: string) => void;
  };
}

export function Topbar({
  title,
  breadcrumb,
  onBreadcrumbClick,
  titleExtra,
  actions,
  onMenuClick,
  user,
  onSignOut,
  theme,
  onToggleTheme,
  notifications,
  language,
  textSize,
  themeOptions,
}: TopbarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [dropdownOpen]);

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : 'U';

  return (
    <header className="topbar">
      {onMenuClick && (
        <button
          onClick={onMenuClick}
          className="btn btn-ghost btn-icon"
          aria-label="Toggle menu"
        >
          <Menu size={18} />
        </button>
      )}

      <div className="topbar-title">
        {breadcrumb && (
          <>
            <button
              onClick={onBreadcrumbClick}
              className="topbar-breadcrumb"
              disabled={!onBreadcrumbClick}
            >
              {breadcrumb}
            </button>
            <span className="topbar-breadcrumb-sep">/</span>
          </>
        )}
        <span className="topbar-page-title">{title}</span>
        {titleExtra}
      </div>

      <div style={{ flex: 1 }} />

      <div className="topbar-actions">
        {actions}
        {notifications && (
          <button
            className="btn btn-ghost btn-icon topbar-bell"
            onClick={notifications.onClick}
            title={notifications.label ?? 'Notifications'}
            aria-label={
              notifications.count > 0
                ? `${notifications.label ?? 'Notifications'} (${notifications.count} unread)`
                : (notifications.label ?? 'Notifications')
            }
          >
            <Bell size={16} />
            {notifications.count > 0 && (
              <span className="topbar-bell-badge" aria-hidden="true">
                {notifications.count > 99 ? '99+' : notifications.count}
              </span>
            )}
          </button>
        )}
        {onToggleTheme && (
          <button
            className="btn btn-ghost btn-icon"
            onClick={onToggleTheme}
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}
      </div>

      {user && (
        <div ref={avatarRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setDropdownOpen((o) => !o)}
            title={user.name ?? 'User'}
            aria-label="Account menu"
            className="topbar-avatar"
          >
            {initials}
          </button>

          {dropdownOpen && (
            <div className="avatar-dropdown">
              <div className="avatar-dropdown-info">
                {user.name && (
                  <div style={{ fontWeight: 600, fontSize: '0.929rem', color: 'var(--text)' }}>
                    {user.name}
                  </div>
                )}
                {user.email && (
                  <div
                    style={{
                      fontSize: '0.786rem',
                      color: 'var(--muted)',
                      fontFamily: 'var(--font-mono)',
                      marginTop: 2,
                      wordBreak: 'break-all',
                    }}
                  >
                    {user.email}
                  </div>
                )}
                {(user.roles && user.roles.length > 0) || user.role ? (
                  <div
                    style={{
                      fontSize: '0.714rem',
                      color: 'var(--muted)',
                      marginTop: 6,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontWeight: 600,
                    }}
                  >
                    {user.roles && user.roles.length > 0
                      ? user.roles.join(', ')
                      : user.role}
                  </div>
                ) : null}
              </div>
              {language && (
                <>
                <div style={sectionLabelStyle}>{language.label ?? 'Language'}</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    padding: '2px 12px 8px',
                    borderBottom: '1px solid var(--border)',
                  }}
                  role="group"
                  aria-label={language.label ?? 'Language'}
                >
                  {language.options.map((opt) => {
                    const active = opt.code === language.current;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => language.onChange(opt.code)}
                        aria-pressed={active}
                        style={{
                          flex: '1 1 0',
                          minWidth: 0,
                          width: '100%',
                          padding: '0.429rem 0',
                          fontSize: '0.786rem',
                          fontWeight: active ? 700 : 500,
                          textAlign: 'center',
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          fontFamily: 'var(--font-mono)',
                          background: active ? 'var(--accent-dim)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--muted)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                </>
              )}
              {textSize && (
                <>
                <div style={sectionLabelStyle}>{textSize.label ?? 'Text Size'}</div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 12px 8px',
                    borderBottom: '1px solid var(--border)',
                  }}
                  role="group"
                  aria-label={textSize.label ?? 'Text Size'}
                >
                  {textSize.options.map((opt) => {
                    const active = Math.abs(opt.value - textSize.current) < 0.01;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => textSize.onChange(opt.value)}
                        aria-pressed={active}
                        style={{
                          flex: '1 1 0',
                          minWidth: 0,
                          width: '100%',
                          padding: '0.429rem 0',
                          fontSize: '0.786rem',
                          fontWeight: active ? 700 : 500,
                          textAlign: 'center',
                          fontFamily: 'var(--font-mono)',
                          background: active ? 'var(--accent-dim)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--muted)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                </>
              )}
              {themeOptions && (
                <>
                <div style={sectionLabelStyle}>{themeOptions.label ?? 'Theme'}</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    padding: '2px 12px 8px',
                    borderBottom: '1px solid var(--border)',
                  }}
                  role="group"
                  aria-label={themeOptions.label ?? 'Theme'}
                >
                  {themeOptions.options.map((opt) => {
                    const active = opt.id === themeOptions.current;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => themeOptions.onChange(opt.id)}
                        aria-pressed={active}
                        style={{
                          flex: '1 1 0',
                          minWidth: 0,
                          padding: '0.429rem 0.25rem',
                          fontSize: '0.714rem',
                          fontWeight: active ? 700 : 500,
                          textAlign: 'center',
                          fontFamily: 'var(--font-body)',
                          background: active ? 'var(--accent-dim)' : 'transparent',
                          color: active ? 'var(--accent)' : 'var(--muted)',
                          border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                          borderRadius: 6,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                </>
              )}
              {onSignOut && (
                <button
                  className="avatar-dropdown-item"
                  onClick={() => {
                    setDropdownOpen(false);
                    onSignOut();
                  }}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
