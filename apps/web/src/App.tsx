import { Button, Sidebar, ToastProvider, ToastViewport, Topbar, useTheme } from '@techconnect/design-system';
import { Activity, Home, User } from 'lucide-react';
import { useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { HealthPage } from './pages/HealthPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';

const NAV_ITEMS = [
  { id: '/', label: 'Home', icon: <Home size={16} /> },
  { id: '/health', label: 'Health', icon: <Activity size={16} /> },
  { id: '/profile', label: 'Profile', icon: <User size={16} /> },
];

export function App() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const current = NAV_ITEMS.find((i) => i.id === pathname) ?? NAV_ITEMS[0];
  const isLight = theme === 'light' || theme === 'techconnect-light';

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '100vh' }}>
        <Sidebar
          items={NAV_ITEMS}
          activeId={current.id}
          onSelect={navigate}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <Topbar
            title={current.label}
            theme={isLight ? 'light' : 'dark'}
            onToggleTheme={() => setTheme(isLight ? 'default' : 'light')}
            actions={
              auth.enabled &&
              (auth.user ? (
                <Button variant="outline" size="sm" onClick={auth.signOut}>
                  Sign out
                </Button>
              ) : (
                <Button size="sm" onClick={auth.signIn}>
                  Sign in
                </Button>
              ))
            }
          />
          <main style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </main>
        </div>
      </div>
      <ToastViewport />
    </ToastProvider>
  );
}
