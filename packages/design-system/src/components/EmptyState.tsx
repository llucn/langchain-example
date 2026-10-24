import { type ReactNode } from 'react';

/**
 * Delta-style EmptyState. Centered column with optional muted icon,
 * title, optional description, and optional action element.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        textAlign: 'center',
      }}
    >
      {icon && (
        <div style={{ color: 'var(--muted)', marginBottom: 12, opacity: 0.5 }}>
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          marginBottom: 6,
        }}
      >
        {title}
      </h3>
      {description && (
        <p style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 300, margin: 0 }}>
          {description}
        </p>
      )}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
