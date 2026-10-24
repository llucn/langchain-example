import { useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { cn } from '../utils/cn';

export interface SwipeActionItem {
  id: string;
  label: string;
  icon?: ReactNode;
  color: string;
  bgColor: string;
  onClick: () => void;
}

export interface SwipeActionProps {
  actions: SwipeActionItem[];
  children: ReactNode;
  threshold?: number;
  className?: string;
}

export function SwipeAction({ actions, children, threshold = 80, className }: SwipeActionProps) {
  const [translateX, setTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startX = useRef(0);
  const currentX = useRef(0);

  const maxSwipe = actions.length * 80;

  function handleTouchStart(e: TouchEvent) {
    startX.current = e.touches[0].clientX;
    currentX.current = startX.current;
    setIsSwiping(true);
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isSwiping) return;
    currentX.current = e.touches[0].clientX;
    const diff = startX.current - currentX.current;
    const clamped = Math.max(0, Math.min(diff, maxSwipe));
    setTranslateX(clamped);
  }

  function handleTouchEnd() {
    setIsSwiping(false);
    if (translateX > threshold) {
      setTranslateX(maxSwipe);
    } else {
      setTranslateX(0);
    }
  }

  function handleClose() {
    setTranslateX(0);
  }

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Swipe actions revealed behind */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        aria-hidden={translateX === 0}
      >
        {actions.map((action) => (
          <button
            key={action.id}
            onClick={() => {
              action.onClick();
              handleClose();
            }}
            className="flex flex-col items-center justify-center w-20 min-h-[var(--tc-touch-min)] text-[var(--tc-text-xs)] font-medium gap-1"
            style={{ color: action.color, backgroundColor: action.bgColor }}
          >
            {action.icon && <span>{action.icon}</span>}
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Main content that slides */}
      <div
        className={cn(
          'relative bg-[var(--tc-bg-card)]',
          !isSwiping && 'transition-transform duration-200',
        )}
        style={{ transform: `translateX(-${translateX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
