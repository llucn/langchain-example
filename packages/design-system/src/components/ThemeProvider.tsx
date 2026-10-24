import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type Theme =
  | 'default'
  | 'light'
  | 'high-contrast'
  | 'sunlight'
  | 'techconnect'
  | 'techconnect-light';

export const ALL_THEMES: readonly Theme[] = [
  'default',
  'light',
  'high-contrast',
  'sunlight',
  'techconnect',
  'techconnect-light',
] as const;

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (ALL_THEMES as readonly string[]).includes(value);
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  simplified: boolean;
  setSimplified: (simplified: boolean) => void;
  /** Font size scale factor: 1 = default (14px root), 0.85 = small, 1.3 = large */
  fontScale: number;
  setFontScale: (scale: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const THEME_KEY = 'tc-theme';
const SIMPLIFIED_KEY = 'tc-simplified';
const FONT_SCALE_KEY = 'tc-font-scale';
const DEFAULT_ROOT_PX = 14;

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (isTheme(stored)) return stored;
  } catch {}
  return 'default';
}

function getStoredSimplified(): boolean {
  try {
    return localStorage.getItem(SIMPLIFIED_KEY) === 'true';
  } catch {}
  return false;
}

function getStoredFontScale(): number {
  try {
    const stored = localStorage.getItem(FONT_SCALE_KEY);
    if (stored) {
      const n = parseFloat(stored);
      if (n >= 0.75 && n <= 1.75) return n;
    }
  } catch {}
  return 1;
}

/**
 * Props for optional server-side hydration + sync.
 *
 * The design-system stays API-agnostic: it doesn't know about auth contexts,
 * base URLs, or fetch details. The app shell wires auth state into these
 * callbacks (see design.md D4).
 *
 *   userId              — null pre-login, a stable id post-login. ThemeProvider
 *                         watches this for login/logout transitions.
 *   getServerTheme      — called once when userId flips non-null. If it
 *                         resolves with a theme, it overrides localStorage
 *                         (DB wins on login merge).
 *   setServerTheme      — called when the user changes theme while logged in;
 *                         debounced to 500ms.
 */
interface ThemeProviderProps {
  children: ReactNode;
  userId?: string | null;
  getServerTheme?: () => Promise<Theme | null>;
  setServerTheme?: (theme: Theme) => Promise<void>;
}

export function ThemeProvider({
  children,
  userId = null,
  getServerTheme,
  setServerTheme,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);
  const [simplified, setSimplifiedState] = useState(getStoredSimplified);
  const [fontScale, setFontScaleState] = useState(getStoredFontScale);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {}
  }, []);

  const setSimplified = useCallback((s: boolean) => {
    setSimplifiedState(s);
    try {
      localStorage.setItem(SIMPLIFIED_KEY, String(s));
    } catch {}
  }, []);

  // Apply font scale to root element — all rem values scale proportionally.
  const applyFontScale = useCallback((scale: number) => {
    const px = `${DEFAULT_ROOT_PX * scale}px`;
    document.documentElement.style.setProperty('--tc-root-font-size', px);
    document.documentElement.style.fontSize = px;
  }, []);

  const setFontScale = useCallback((scale: number) => {
    const clamped = Math.min(1.75, Math.max(0.75, scale));
    setFontScaleState(clamped);
    applyFontScale(clamped);
    try {
      localStorage.setItem(FONT_SCALE_KEY, String(clamped));
    } catch {}
  }, [applyFontScale]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'default') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);
  // useLayoutEffect ensures the inline style is applied before paint —
  // prevents a flash where CSS html { font-size: 14px } briefly wins.
  useLayoutEffect(() => {
    applyFontScale(fontScale);
  }, [fontScale]);

  useEffect(() => {
    const root = document.documentElement;
    if (simplified) {
      root.setAttribute('data-simplified', 'true');
    } else {
      root.removeAttribute('data-simplified');
    }
  }, [simplified]);

  // Login-transition hydration: when userId flips from null to a value, fetch
  // the server theme and apply it. DB wins — overwrite localStorage to match
  // so a subsequent logout leaves the server value as the pre-login default.
  // Logout preserves whatever theme is currently applied (design D4).
  const hydratedForUserId = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || !getServerTheme) return;
    if (hydratedForUserId.current === userId) return; // already hydrated for this session
    hydratedForUserId.current = userId;

    let canceled = false;
    getServerTheme()
      .then((serverTheme) => {
        if (canceled) return;
        if (serverTheme && isTheme(serverTheme) && serverTheme !== theme) {
          setThemeState(serverTheme);
          try {
            localStorage.setItem(THEME_KEY, serverTheme);
          } catch {}
        }
      })
      .catch(() => {
        // Silent fail — keep localStorage/default. Don't block UI for a
        // preferences fetch.
      });

    return () => {
      canceled = true;
    };
  }, [userId, getServerTheme, theme]);

  // Reset hydration marker on logout so the next login re-hydrates.
  useEffect(() => {
    if (userId === null) {
      hydratedForUserId.current = null;
    }
  }, [userId]);

  // Debounced server sync: write theme changes to the backend while logged in.
  // Guarded by `hydratedForUserId` — we only sync after the initial hydrate has
  // fired, so the hydrate itself doesn't trigger a redundant write back.
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!userId || !setServerTheme) return;
    if (hydratedForUserId.current !== userId) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      setServerTheme(theme).catch(() => {
        // Silent fail — preference stays in localStorage regardless.
      });
    }, 500);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [theme, userId, setServerTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, simplified, setSimplified, fontScale, setFontScale }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
