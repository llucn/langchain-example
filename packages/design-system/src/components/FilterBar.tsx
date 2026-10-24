import { type ReactNode } from 'react';
import { Search } from 'lucide-react';

/**
 * Delta-style FilterBar. Horizontal row: search input on the left (flex-1),
 * filter selects after. Full-width, 1px border, 14px radius, card background.
 */
export interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  children?: ReactNode;
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  children,
}: FilterBarProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 14,
        flexWrap: 'wrap',
      }}
    >
      {onSearchChange && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flex: 1,
            minWidth: 200,
            background: 'var(--card2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '0 12px',
          }}
        >
          <Search size={14} style={{ color: 'var(--muted)', flexShrink: 0 }} />
          <input
            type="text"
            value={searchValue ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? 'Search...'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text)',
              fontSize: 13,
              fontFamily: 'var(--font-body)',
              padding: '9px 0',
              outline: 'none',
            }}
          />
        </div>
      )}
      {children}
    </div>
  );
}

export interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}

export function FilterSelect({ value, onChange, options, placeholder }: FilterSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--card2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        color: 'var(--text)',
        fontSize: 13,
        fontFamily: 'var(--font-body)',
        padding: '9px 32px 9px 12px',
        cursor: 'pointer',
        appearance: 'none',
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg width='10' height='6' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2364748b' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E\")",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
