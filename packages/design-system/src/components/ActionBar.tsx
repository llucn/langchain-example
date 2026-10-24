import { type ReactNode } from 'react';

export interface ActionBarItem {
  id: string;
  label: string;
  icon: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}

export interface ActionBarProps {
  actions: ActionBarItem[];
  className?: string;
}

/**
 * Sticky action toolbar that sits above the bottom TabBar (mobile) or flush
 * to the bottom (desktop). Buttons scroll horizontally if they don't fit so
 * the rightmost actions never get clipped. Styling lives in `.action-bar` /
 * `.action-bar-btn` in theme.css.
 */
export function ActionBar({ actions, className }: ActionBarProps) {
  if (actions.length === 0) return null;

  return (
    <div
      className={['action-bar', className].filter(Boolean).join(' ')}
      role="toolbar"
      aria-label="Actions"
    >
      <div className="action-bar-scroll">
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={action.disabled}
            title={action.disabled ? action.disabledReason : undefined}
            className={`action-bar-btn action-bar-btn--${action.variant ?? 'secondary'}`}
            aria-label={action.disabled && action.disabledReason ? `${action.label} — ${action.disabledReason}` : action.label}
            style={action.disabled ? { opacity: 0.4, pointerEvents: 'none' } : undefined}
          >
            <span aria-hidden="true" className="action-bar-btn-icon">
              {action.icon}
            </span>
            <span className="action-bar-btn-label">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
