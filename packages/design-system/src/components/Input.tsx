import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../utils/cn';

/**
 * Delta-style input.
 *
 * Label: uppercase 12px/600, 0.06em tracking, muted color
 * Input: 10×14 padding, card2 background, 8px radius, accent focus ring
 * Preserves the prior TC API (label / helpText / error / size / leftIcon / rightIcon).
 */
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  helpText?: string;
  error?: string;
  size?: 'sm' | 'md' | 'lg';
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, helpText, error, size = 'md', leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="flex flex-col" style={{ gap: 6 }}>
        {label && (
          <label
            htmlFor={inputId}
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--muted2)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
            {props.required && (
              <span style={{ color: 'var(--red)', marginLeft: 4 }} aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span
              className="absolute"
              style={{ left: 12, color: 'var(--muted)' }}
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(className)}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              paddingTop:    size === 'sm' ?  6 : size === 'lg' ? 12 : 10,
              paddingBottom: size === 'sm' ?  6 : size === 'lg' ? 12 : 10,
              paddingLeft:   leftIcon  ? 40 : (size === 'sm' ? 12 : size === 'lg' ? 16 : 14),
              paddingRight:  rightIcon ? 40 : (size === 'sm' ? 12 : size === 'lg' ? 16 : 14),
              background: 'var(--card2)',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 8,
              color: 'var(--text)',
              fontSize: size === 'sm' ? 12 : size === 'lg' ? 15 : 14,
              fontFamily: 'var(--font-body)',
              transition: 'all 0.15s',
              outline: 'none',
              ...props.style,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--accent)';
              e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'var(--red-dim)' : 'var(--accent-dim)'}`;
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = error ? 'var(--red)' : 'var(--border)';
              e.currentTarget.style.boxShadow = 'none';
              props.onBlur?.(e);
            }}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? `${inputId}-error` : helpText ? `${inputId}-help` : undefined
            }
            {...props}
          />
          {rightIcon && (
            <span
              className="absolute"
              style={{ right: 12, color: 'var(--muted)' }}
              aria-hidden="true"
            >
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p
            id={`${inputId}-error`}
            role="alert"
            style={{ fontSize: 12, color: 'var(--red)' }}
          >
            {error}
          </p>
        )}
        {helpText && !error && (
          <p id={`${inputId}-help`} style={{ fontSize: 12, color: 'var(--muted)' }}>
            {helpText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
