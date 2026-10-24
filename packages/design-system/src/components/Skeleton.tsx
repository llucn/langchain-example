/**
 * Delta-style loading Skeleton. A pulsing rectangle for loading
 * placeholders. TableSkeleton renders a grid of varying-width cells.
 */
export interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({
  width,
  height = '16px',
  borderRadius = '6px',
  className,
}: SkeletonProps) {
  return (
    <div
      className={`ds-skeleton ${className || ''}`}
      style={{ width, height, borderRadius }}
    />
  );
}

export interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

export function TableSkeleton({ rows = 5, cols = 5 }: TableSkeletonProps) {
  return (
    <div className="ds-skeleton-table">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ds-skeleton-row">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} width={`${60 + Math.random() * 40}%`} height="14px" />
          ))}
        </div>
      ))}
    </div>
  );
}
