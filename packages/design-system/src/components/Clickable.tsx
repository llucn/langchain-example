import {
  forwardRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';

/**
 * Accessible, keyboard-operable clickable container.
 *
 * Replaces the `<div onClick>` anti-pattern across list/feed pages with a
 * proper `role="button"`, tabIndex, and Enter/Space keyboard handlers.
 * Adds a visible focus ring and meets WCAG 2.1 AA.
 *
 * Default styling matches the Delta `.row-item` (14×18 padding, 12px radius,
 * card bg, border + hover lift). Override via `className`/`style`.
 */
export interface ClickableProps {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Accessible label — required when children are non-textual (icons only). */
  ariaLabel?: string;
  /** Disable click + key handlers and dim the visual. */
  disabled?: boolean;
  /** Override the default `.row-item` styling — useful for custom containers. */
  variant?: 'row' | 'plain';
}

export const Clickable = forwardRef<HTMLDivElement, ClickableProps>(
  ({ onClick, children, className, style, ariaLabel, disabled, variant = 'row' }, ref) => {
    function handleClick(e: MouseEvent<HTMLDivElement>) {
      if (disabled) return;
      e.stopPropagation();
      onClick();
    }
    function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
      if (disabled) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }
    }

    const cls = variant === 'row' ? `row-item ${className ?? ''}` : className;

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-disabled={disabled || undefined}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cls}
        style={{
          ...(disabled && { opacity: 0.5, cursor: 'not-allowed' }),
          ...style,
        }}
      >
        {children}
      </div>
    );
  },
);
Clickable.displayName = 'Clickable';
