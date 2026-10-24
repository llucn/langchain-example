import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../utils/cn';

/**
 * Delta-style Card.
 *
 * Visual: rounded-14, 1px border, subtle bg, fadeUp animation on mount.
 * `CardHeader + CardTitle` composition renders a Delta-style card head:
 *   - uppercase title with 0.04em tracking
 *   - 13px bold
 *   - bottom border
 *   - subtle card-head-bg tint
 * `CardContent` is the body pad (16px 20px — Delta's exact numbers).
 *
 * Backward compatible with `variant` + `padding` + `interactive` props
 * (the prior TC API); padding applies only when there is no CardHeader child
 * (the card-head handles its own padding).
 */
export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding, interactive = false, children, ...props }, ref) => {
    // Detect whether a CardHeader is present — if so the header manages its
    // own padding and we don't want to add extra padding at the card level.
    const hasHeader = hasCardHeader(children);
    const effectivePadding = padding ?? (hasHeader ? 'none' : 'md');

    return (
      <div
        ref={ref}
        className={cn(
          'card',
          variant === 'outline' && 'border-2',
          // Padding only when not using CardHeader composition
          effectivePadding === 'sm' && 'p-3',
          effectivePadding === 'md' && 'p-4',
          effectivePadding === 'lg' && 'p-6',
          interactive && 'cursor-pointer transition-colors',
          className,
        )}
        style={{
          background: variant === 'elevated' ? 'var(--surface)' : undefined,
          ...(interactive
            ? {
                ['--hover-bg' as string]: 'var(--hover-subtle)',
              }
            : {}),
          ...props.style,
        }}
        onMouseEnter={(e) => {
          if (interactive) e.currentTarget.style.background = 'var(--card2)';
          props.onMouseEnter?.(e);
        }}
        onMouseLeave={(e) => {
          if (interactive) e.currentTarget.style.background = '';
          props.onMouseLeave?.(e);
        }}
        tabIndex={interactive ? 0 : undefined}
        role={interactive ? 'button' : undefined}
        {...props}
      >
        {children}
      </div>
    );
  },
);
Card.displayName = 'Card';

function hasCardHeader(children: React.ReactNode): boolean {
  let found = false;
  if (!children) return false;
  const arr = Array.isArray(children) ? children : [children];
  for (const c of arr) {
    if (c && typeof c === 'object' && 'type' in c) {
      const el = c as { type: unknown };
      if (el.type === CardHeader) {
        found = true;
        break;
      }
    }
  }
  return found;
}

/** Delta-style card head — uppercase title, bottom border. */
export interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}
export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('card-head', className)} {...props}>
      <div className="card-head-text" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  ),
);
CardHeader.displayName = 'CardHeader';

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {}
export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ className, children, ...props }, ref) => (
    <h3 ref={ref} className={cn('card-head-title', className)} {...props}>
      {children}
    </h3>
  ),
);
CardTitle.displayName = 'CardTitle';

export interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}
export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('card-body', className)} style={{ color: 'var(--text)', ...props.style }} {...props}>
      {children}
    </div>
  ),
);
CardContent.displayName = 'CardContent';
