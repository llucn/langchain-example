import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { UserProfile } from '@app/shared';
import { apiFetch, setTokenGetter } from '../lib/api';

interface AuthState {
  /** false when OIDC_ISSUER / OIDC_CLIENT_ID are not configured */
  enabled: boolean;
  loading: boolean;
  user: User | null;
  /** Admin role (from `/auth/me`); true when authentication is disabled. */
  isAdmin: boolean;
  /** false while the role of a signed-in user is still being fetched. */
  adminKnown: boolean;
  signIn: () => void;
  signOut: () => void;
}

const { OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_COGNITO_DOMAIN, OIDC_SCOPE } = import.meta.env;
const enabled = Boolean(OIDC_ISSUER && OIDC_CLIENT_ID);

// HashRouter keeps routes after `#`, so the OIDC redirect lands on the site root
// (`?code=...&state=...`) and is handled here before the router mounts routes.
const redirectUri = `${window.location.origin}${window.location.pathname}`;

const manager = enabled
  ? new UserManager({
      authority: OIDC_ISSUER!,
      client_id: OIDC_CLIENT_ID!,
      redirect_uri: redirectUri,
      post_logout_redirect_uri: redirectUri,
      response_type: 'code', // Authorization Code + PKCE
      scope: OIDC_SCOPE || 'openid email phone',
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    })
  : null;

const AuthContext = createContext<AuthState>({
  enabled,
  loading: false,
  user: null,
  isAdmin: !enabled,
  adminKnown: true,
  signIn: () => undefined,
  signOut: () => undefined,
});

export const useAuth = () => useContext(AuthContext);

// React StrictMode runs effects twice in dev. The authorization code is single-use, so the
// callback must be processed once per page load: share one promise across effect runs.
let userPromise: Promise<User | null> | undefined;

function loadUser(): Promise<User | null> {
  userPromise ??= (async () => {
    const params = new URLSearchParams(window.location.search);
    const isCallback = params.has('code') && params.has('state');
    const u = isCallback ? await manager!.signinRedirectCallback() : await manager!.getUser();
    if (isCallback) window.history.replaceState({}, '', redirectUri + window.location.hash);
    return u && !u.expired ? u : null;
  })();
  return userPromise;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(enabled);
  // null = signed in, role not known yet
  const [isAdmin, setIsAdmin] = useState<boolean | null>(!enabled);

  useEffect(() => {
    if (!manager) return;
    loadUser()
      .then(setUser, (e) => console.error('OIDC error', e))
      .finally(() => setLoading(false));

    const onLoaded = (u: User) => setUser(u);
    const onUnloaded = () => setUser(null);
    manager.events.addUserLoaded(onLoaded);
    manager.events.addUserUnloaded(onUnloaded);
    return () => {
      manager.events.removeUserLoaded(onLoaded);
      manager.events.removeUserUnloaded(onUnloaded);
    };
  }, []);

  useEffect(() => {
    // ID token: the API accepts it (aud = client id) and forwards it to the MCP servers.
    setTokenGetter(() => user?.id_token);
    // The API decides who is admin (ADMIN_GROUP); the UI only hides what the API would refuse.
    if (!user) {
      setIsAdmin(!enabled);
      return;
    }
    setIsAdmin(null);
    let cancelled = false;
    apiFetch<UserProfile>('/auth/me').then(
      (me) => !cancelled && setIsAdmin(Boolean(me.isAdmin)),
      () => !cancelled && setIsAdmin(false),
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<AuthState>(
    () => ({
      enabled,
      loading,
      user,
      isAdmin: isAdmin === true,
      adminKnown: isAdmin !== null,
      signIn: () => void manager?.signinRedirect(),
      signOut: () => {
        void manager?.removeUser();
        // Cognito has no standard end_session_endpoint: use its hosted-UI /logout
        if (OIDC_COGNITO_DOMAIN) {
          const q = new URLSearchParams({ client_id: OIDC_CLIENT_ID!, logout_uri: redirectUri });
          const domain = OIDC_COGNITO_DOMAIN.replace(/[/]+$/, ''); // avoid `//logout`
          window.location.assign(`${domain}/logout?${q}`);
        }
      },
    }),
    [loading, user, isAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
