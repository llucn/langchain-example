import { type ReactNode, useState, useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../utils/cn';

/**
 * Delta-style sidebar. All styling lives in .sidebar / .nav-item CSS classes
 * defined in theme.css — this component just applies them.
 */
export interface SidebarItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  group?: string;
}

export interface SidebarProps {
  items: SidebarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
  brand?: ReactNode;
  /**
   * Group names that start expanded. All others start collapsed.
   * Omit to expand all groups (legacy behavior).
   */
  defaultOpenGroups?: string[];
}

export function Sidebar({
  items,
  activeId,
  onSelect,
  collapsed = false,
  onToggleCollapse,
  className,
  brand,
  defaultOpenGroups,
}: SidebarProps) {
  // Group items into sections preserving declaration order
  const groups = items.reduce<Array<{ name: string; items: SidebarItem[] }>>((acc, item) => {
    const name = item.group || '';
    const last = acc[acc.length - 1];
    if (last && last.name === name) {
      last.items.push(item);
    } else {
      acc.push({ name, items: [item] });
    }
    return acc;
  }, []);

  // Collapsible group state. A group is open if:
  //   - defaultOpenGroups is not specified (all open, legacy behavior)
  //   - OR the group is in defaultOpenGroups
  //   - OR the group contains the active item
  //   - OR the user has manually toggled it open
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const collapsible = !!defaultOpenGroups;

  const isGroupOpen = useCallback(
    (grp: { name: string; items: SidebarItem[] }) => {
      if (!collapsible) return true;
      // Ungrouped items (no name) are always visible — they're top-level nav
      if (!grp.name) return true;
      // Explicit user toggle takes priority
      if (grp.name in toggled) return toggled[grp.name];
      // Default open groups
      if (defaultOpenGroups!.includes(grp.name)) return true;
      // Group containing active item stays open
      if (grp.items.some((i) => i.id === activeId)) return true;
      return false;
    },
    [collapsible, toggled, defaultOpenGroups, activeId],
  );

  const toggleGroup = (name: string) => {
    const opening = !isGroupOpen({ name, items: [] });
    if (opening) {
      // Accordion: close all others when opening one
      const next: Record<string, boolean> = {};
      for (const g of groups) {
        next[g.name] = g.name === name;
      }
      setToggled(next);
    } else {
      setToggled((prev) => ({ ...prev, [name]: false }));
    }
  };

  return (
    <aside
      className={cn('sidebar', className)}
      style={collapsed ? { width: 64 } : undefined}
      role="navigation"
      aria-label="Sidebar navigation"
    >
      {/* Brand */}
      <div
        className="sidebar-logo"
        style={collapsed ? { justifyContent: 'center', padding: '20px 0 16px' } : undefined}
      >
        {brand ?? (
          <>
            <div className="sidebar-logo-mark" aria-hidden="true">TC</div>
            {!collapsed && (
              <div className="sidebar-logo-text">
                <div className="t1">TECHCONNECT</div>
                <div className="t2">by Delta Software</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {groups.map((grp, gi) => {
          const open = isGroupOpen(grp);
          const hasLabel = !!grp.name && !collapsed;

          return (
            <div key={gi}>
              {hasLabel && (
                <button
                  type="button"
                  className="sidebar-section"
                  onClick={collapsible ? () => toggleGroup(grp.name) : undefined}
                  aria-expanded={open}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    cursor: collapsible ? 'pointer' : 'default',
                    padding: undefined,
                    color: 'inherit',
                    font: 'inherit',
                    textAlign: 'left',
                  }}
                >
                  <span>{grp.name}</span>
                  {collapsible && (
                    <ChevronDown
                      size={12}
                      style={{
                        transition: 'transform 0.15s',
                        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
                        opacity: 0.5,
                      }}
                    />
                  )}
                </button>
              )}
              {(open || collapsed) && grp.items.map((item) => {
                const isActive = item.id === activeId;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className={cn('nav-item', isActive && 'active', collapsed && 'collapsed')}
                    aria-current={isActive ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    {!collapsed && <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>}
                    {!collapsed && item.badge !== undefined && item.badge > 0 && (
                      <span className="nav-badge">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      {onToggleCollapse && (
        <div className="sidebar-bottom">
          <button
            onClick={onToggleCollapse}
            className="sidebar-collapse-btn"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            {!collapsed && 'Collapse'}
          </button>
        </div>
      )}
    </aside>
  );
}
