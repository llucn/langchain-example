import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Delta-style Modal. Overlay + centered card with title header,
 * body, optional footer. Locks body scroll while open and closes on
 * Escape. Width defaults to 480px.
 */
export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({ open, onClose, title, children, footer, width }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portaled to <body> rather than rendered in place: a `position: fixed`
  // overlay is only guaranteed to cover the viewport if no ancestor creates
  // a new containing block (e.g. an element with a `transform`, including
  // one left behind by a finished `animation-fill-mode: both` animation —
  // `.card`'s mount animation does exactly this). Without the portal, a
  // Modal opened from inside such an ancestor renders clipped to that
  // ancestor's bounds instead of full-screen.
  return createPortal(
    <div className="ds-modal-overlay" onClick={onClose}>
      <div
        className="ds-modal"
        style={{ maxWidth: width || '480px' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="ds-modal-header">
          <h2 className="ds-modal-title">{title}</h2>
          <button
            className="ds-modal-close"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <X size={16} />
          </button>
        </div>
        <div className="ds-modal-body">{children}</div>
        {footer && <div className="ds-modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
