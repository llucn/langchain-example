import { type ReactNode } from 'react';
import { CountBadge } from './Badge';

/**
 * Bottom navigation bar for mobile / Capacitor.
 *
 * Sized like native iOS/Android tab bars: 56 px content height plus iOS safe-area
 * inset so it clears the home indicator. Each tab is a vertical icon + label.
 * Styling lives in `.tabbar` / `.tabbar-item` in theme.css so it tracks the
 * theme tokens and stays consistent with the rest of the design system.
 */

export interface TabBarItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
}

export interface TabBarProps {
  items: TabBarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function TabBar({ items, activeId, onSelect, className }: TabBarProps) {
  return (
    <nav
      className={['tabbar', className].filter(Boolean).join(' ')}
      role="tablist"
      aria-label="Main navigation"
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            aria-label={item.label}
            onClick={() => onSelect(item.id)}
            className={['tabbar-item', isActive ? 'is-active' : ''].join(' ')}
          >
            <span className="tabbar-icon">
              {item.icon}
              {item.badge !== undefined && item.badge > 0 && (
                <span className="tabbar-badge">
                  <CountBadge count={item.badge} />
                </span>
              )}
            </span>
            <span className="tabbar-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
