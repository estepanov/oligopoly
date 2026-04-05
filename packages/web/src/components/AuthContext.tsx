import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  clearStoredToken,
  fetchLogout,
  fetchSession,
  getStoredToken,
  storeToken,
} from "../api/auth";

interface AuthUser {
  userId: string;
  username: string;
  expiresAt: number;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (
    token: string,
    userId: string,
    username: string,
    expiresAt: number,
  ) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const session = await fetchSession();
      setUser({
        userId: session.userId,
        username: session.username,
        expiresAt: session.expiresAt,
      });
    } catch {
      clearStoredToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    (token: string, userId: string, username: string, expiresAt: number) => {
      storeToken(token);
      setUser({ userId, username, expiresAt });
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetchLogout();
    } catch {
      clearStoredToken();
    }
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
