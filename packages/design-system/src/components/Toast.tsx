import { forwardRef, type ReactNode } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { cn } from '../utils/cn';

export type ToastTier = 'critical' | 'important' | 'info';

export interface ToastProps extends ToastPrimitive.ToastProps {
  tier?: ToastTier;
  title: string;
  description?: string;
  action?: ReactNode;
}

const tierStyles: Record<ToastTier, string> = {
  critical:
    'border-[var(--tc-notify-critical)] bg-[var(--tc-notify-critical-bg)] text-[var(--tc-notify-critical)]',
  important:
    'border-[var(--tc-notify-important)] bg-[var(--tc-notify-important-bg)] text-[var(--tc-notify-important)]',
  info:
    'border-[var(--tc-notify-info)] bg-[var(--tc-notify-info-bg)] text-[var(--tc-notify-info)]',
};

export const Toast = forwardRef<HTMLLIElement, ToastProps>(
  ({ tier = 'info', title, description, action, className, ...props }, ref) => (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(
        'rounded-[var(--tc-radius-lg)] border-2 p-[var(--tc-space-4)] shadow-[var(--tc-shadow-lg)]',
        'flex items-start gap-3',
        tierStyles[tier],
        className,
      )}
      {...props}
    >
      <div className="flex-1">
        <ToastPrimitive.Title className="font-semibold text-[var(--tc-text-base)]">
          {title}
        </ToastPrimitive.Title>
        {description && (
          <ToastPrimitive.Description className="mt-1 text-[var(--tc-text-sm)] opacity-90">
            {description}
          </ToastPrimitive.Description>
        )}
      </div>
      {action && <ToastPrimitive.Action altText="Action" asChild>{action}</ToastPrimitive.Action>}
      <ToastPrimitive.Close
        className="shrink-0 rounded-[var(--tc-radius-sm)] p-1 opacity-70 hover:opacity-100 focus-visible:outline-2"
        aria-label="Dismiss"
      >
        ✕
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  ),
);
Toast.displayName = 'Toast';

export function ToastProvider({ children }: { children: ReactNode }) {
  return <ToastPrimitive.Provider swipeDirection="right">{children}</ToastPrimitive.Provider>;
}

export function ToastViewport() {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        'fixed bottom-0 right-0 flex flex-col gap-2 p-4 w-full sm:max-w-sm',
        'outline-none',
      )}
      style={{ zIndex: 'var(--tc-z-toast)' } as React.CSSProperties}
    />
  );
}
