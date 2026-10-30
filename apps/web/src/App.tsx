import {
  Button,
  Sidebar,
  ToastProvider,
  ToastViewport,
  Topbar,
  useTheme,
} from '@techconnect/design-system';
import { Activity, ClipboardCheck, Home, MessageSquare, User } from 'lucide-react';
import { useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { ChatPage } from './pages/ChatPage';
import { HealthPage } from './pages/HealthPage';
import { HomePage } from './pages/HomePage';
import { LogReviewPage } from './pages/LogReviewPage';
import { ProfilePage } from './pages/ProfilePage';

const NAV_ITEMS = [
  { id: '/', label: 'Home', icon: <Home size={16} /> },
  { id: '/chat', label: 'Chat', icon: <MessageSquare size={16} /> },
  { id: '/health', label: 'Health', icon: <Activity size={16} /> },
  { id: '/profile', label: 'Profile', icon: <User size={16} /> },
];

/** Shown to admins only (the API enforces it too). */
const ADMIN_NAV_ITEMS = [
  { id: '/log-review', label: 'Log Review', icon: <ClipboardCheck size={16} /> },
];

export function App() {
  const auth = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = auth.isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV_ITEMS] : NAV_ITEMS;
  const current =
    [...NAV_ITEMS, ...ADMIN_NAV_ITEMS].find(
      (i) => i.id === pathname || (i.id !== '/' && pathname.startsWith(`${i.id}/`)),
    ) ?? NAV_ITEMS[0];
  const isLight = theme === 'light' || theme === 'techconnect-light';

  return (
    <ToastProvider>
      <div style={{ display: 'flex', height: '98vh' }}>
        <Sidebar
          items={navItems}
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
          <main
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              padding: pathname.startsWith('/chat') || pathname.startsWith('/log-review') ? 0 : 24,
            }}
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/chat/:sessionId?" element={<ChatPage />} />
              <Route path="/health" element={<HealthPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/log-review" element={<LogReviewPage />} />
            </Routes>
          </main>
        </div>
      </div>
      <ToastViewport />
    </ToastProvider>
  );
}
