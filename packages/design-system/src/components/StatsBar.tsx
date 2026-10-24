/**
 * Delta-style StatsBar. Responsive grid of stat cards with
 * 1px border separators (border background + 1px gap), big mono
 * number, uppercase muted label.
 */
export interface StatItem {
  label: string;
  value: number | string;
  color?: string;
}

export interface StatsBarProps {
  stats: StatItem[];
}

export function StatsBar({ stats }: StatsBarProps) {
  return (
    <div className="ds-stats-bar">
      {stats.map((stat) => (
        <div key={stat.label} className="ds-stat-card">
          <div
            className="ds-stat-num"
            style={stat.color ? { color: stat.color } : undefined}
          >
            {stat.value}
          </div>
          <div className="ds-stat-label">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}
