import { type HTMLAttributes, forwardRef } from 'react';
import { cn } from '../utils/cn';

/*
 * Status shapes mapping (for color-blind safety):
 * open       → circle    ●
 * assigned   → diamond   ◆
 * in-progress → arrow    →
 * on-hold    → pause     ‖
 * completed  → check     ✓
 * closed     → square    ■
 * cancelled  → x-mark    ✕
 */

type WOStatus = string;
type WOPriority = string;

const STATUS_CONFIG: Record<string, { label: string; shape: string; colorVar: string; bgVar: string }> = {
  open:               { label: 'Open',              shape: '●', colorVar: '--tc-status-open',        bgVar: '--tc-status-open-bg' },
  'waiting-approval': { label: 'Waiting Approval', shape: '◇', colorVar: '--tc-status-open',        bgVar: '--tc-status-open-bg' },
  assigned:      { label: 'Assigned',    shape: '◆', colorVar: '--tc-status-assigned',    bgVar: '--tc-status-assigned-bg' },
  'in-progress': { label: 'In Progress', shape: '→', colorVar: '--tc-status-in-progress', bgVar: '--tc-status-in-progress-bg' },
  'on-hold':           { label: 'On Hold',            shape: '‖', colorVar: '--tc-status-on-hold',     bgVar: '--tc-status-on-hold-bg' },
  'waiting-material':  { label: 'Waiting Material',  shape: '◇', colorVar: '--tc-status-in-progress', bgVar: '--tc-status-in-progress-bg' },
  'waiting-schedule':  { label: 'Waiting Schedule',  shape: '◇', colorVar: '--tc-status-assigned',    bgVar: '--tc-status-assigned-bg' },
  completed:     { label: 'Completed',   shape: '✓', colorVar: '--tc-status-completed',   bgVar: '--tc-status-completed-bg' },
  closed:        { label: 'Closed',      shape: '■', colorVar: '--tc-status-closed',      bgVar: '--tc-status-closed-bg' },
  cancelled:     { label: 'Cancelled',   shape: '✕', colorVar: '--tc-status-cancelled',   bgVar: '--tc-status-cancelled-bg' },
};

const PRIORITY_CONFIG: Record<string, { label: string; colorVar: string; bgVar: string }> = {
  emergency: { label: 'Emergency', colorVar: '--tc-priority-emergency', bgVar: '--tc-priority-emergency-bg' },
  urgent:    { label: 'Urgent',    colorVar: '--tc-priority-urgent',    bgVar: '--tc-priority-urgent-bg' },
  high:      { label: 'High',      colorVar: '--tc-priority-high',      bgVar: '--tc-priority-high-bg' },
  medium:    { label: 'Medium',    colorVar: '--tc-priority-medium',    bgVar: '--tc-priority-medium-bg' },
  low:       { label: 'Low',       colorVar: '--tc-priority-low',       bgVar: '--tc-priority-low-bg' },
};

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status: WOStatus;
}

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, className, ...props }, ref) => {
    const config = STATUS_CONFIG[status];
    if (!config) return null;

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--tc-radius-full)]',
          'text-[var(--tc-text-sm)] font-medium whitespace-nowrap',
          className,
        )}
        style={{
          color: `var(${config.colorVar})`,
          backgroundColor: `var(${config.bgVar})`,
        }}
        {...props}
      >
        <span aria-hidden="true" className="text-xs">{config.shape}</span>
        {config.label}
      </span>
    );
  },
);
StatusBadge.displayName = 'StatusBadge';

export interface PriorityBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  priority: WOPriority;
}

export const PriorityBadge = forwardRef<HTMLSpanElement, PriorityBadgeProps>(
  ({ priority, className, ...props }, ref) => {
    const config = PRIORITY_CONFIG[priority];
    if (!config) return null;

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center gap-1 px-2.5 py-1 rounded-[var(--tc-radius-full)]',
          'text-[var(--tc-text-sm)] font-medium whitespace-nowrap',
          className,
        )}
        style={{
          color: `var(${config.colorVar})`,
          backgroundColor: `var(${config.bgVar})`,
        }}
        {...props}
      >
        {config.label}
      </span>
    );
  },
);
PriorityBadge.displayName = 'PriorityBadge';

export interface CountBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  count: number;
  max?: number;
}

export const CountBadge = forwardRef<HTMLSpanElement, CountBadgeProps>(
  ({ count, max = 99, className, ...props }, ref) => {
    if (count <= 0) return null;
    const display = count > max ? `${max}+` : String(count);

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center min-w-5 h-5 px-1.5',
          'rounded-[var(--tc-radius-full)]',
          'bg-[var(--tc-status-cancelled)] text-white',
          'text-xs font-bold',
          className,
        )}
        aria-label={`${count} items`}
        {...props}
      >
        {display}
      </span>
    );
  },
);
CountBadge.displayName = 'CountBadge';
