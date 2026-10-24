import { forwardRef, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../utils/cn';

export interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export const DialogTrigger = DialogPrimitive.Trigger;

export const DialogContent = forwardRef<
  HTMLDivElement,
  DialogPrimitive.DialogContentProps & { fullScreenMobile?: boolean }
>(({ className, fullScreenMobile = true, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className={cn(
        'fixed inset-0 bg-[var(--tc-bg-overlay)]',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      )}
      style={{ zIndex: 'var(--tc-z-modal)' } as React.CSSProperties}
    />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed bg-[var(--tc-bg-elevated)] shadow-[var(--tc-shadow-lg)]',
        'focus:outline-none',
        // Mobile: full screen
        fullScreenMobile && 'inset-0 rounded-none sm:inset-auto',
        // Desktop: centered dialog
        fullScreenMobile && 'sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2',
        fullScreenMobile && 'sm:max-w-lg sm:w-full sm:max-h-[85vh] sm:rounded-[var(--tc-radius-xl)]',
        // Non-fullscreen: always centered
        !fullScreenMobile && 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        !fullScreenMobile && 'max-w-lg w-[calc(100%-2rem)] max-h-[85vh] rounded-[var(--tc-radius-xl)]',
        'overflow-y-auto p-[var(--tc-space-6)]',
        className,
      )}
      style={{ zIndex: 'var(--tc-z-modal)' } as React.CSSProperties}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = 'DialogContent';

export const DialogTitle = forwardRef<HTMLHeadingElement, DialogPrimitive.DialogTitleProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-[var(--tc-text-xl)] font-semibold text-[var(--tc-text-primary)]', className)}
      {...props}
    />
  ),
);
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = forwardRef<HTMLParagraphElement, DialogPrimitive.DialogDescriptionProps>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-[var(--tc-text-base)] text-[var(--tc-text-secondary)] mt-2', className)}
      {...props}
    />
  ),
);
DialogDescription.displayName = 'DialogDescription';

export const DialogClose = DialogPrimitive.Close;
