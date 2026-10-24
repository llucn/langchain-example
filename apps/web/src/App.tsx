import { Link, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import { HealthPage } from './pages/HealthPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';

export function App() {
  const auth = useAuth();
  return (
    <div style={{ fontFamily: 'sans-serif', padding: 16 }}>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/health">Health</Link>
        <Link to="/profile">Profile</Link>
        {auth.enabled &&
          (auth.user ? (
            <button onClick={auth.signOut}>Sign out</button>
          ) : (
            <button onClick={auth.signIn}>Sign in</button>
          ))}
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/health" element={<HealthPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </div>
  );
}
