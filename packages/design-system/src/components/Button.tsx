import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../utils/cn';

/**
 * Delta-style button. Uses the `.btn` / `.btn-primary` etc. utility classes
 * defined in theme.css. 8px radius, 7×14 padding, 13px/600 weight.
 * Preserves the prior TC API (variant / size / loading / icon / iconPosition).
 */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  asChild?: boolean;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconPosition = 'left',
      asChild = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        className={cn(
          'btn',
          VARIANT_CLASS[variant],
          size === 'sm' && 'btn-sm',
          size === 'lg' && 'btn-lg',
          className,
        )}
        style={{
          // Size overrides (base btn is 7×14 / 13px — Delta default)
          ...(size === 'sm' ? { padding: '5px 10px', fontSize: '12px' } : {}),
          ...(size === 'lg' ? { padding: '10px 20px', fontSize: '14px' } : {}),
          ...props.style,
        }}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <svg
            className="animate-spin"
            style={{ width: 14, height: 14 }}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : icon && iconPosition === 'left' ? (
          <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
            {icon}
          </span>
        ) : null}
        {children}
        {!loading && icon && iconPosition === 'right' ? (
          <span style={{ display: 'inline-flex', flexShrink: 0 }} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </Comp>
    );
  },
);

Button.displayName = 'Button';
