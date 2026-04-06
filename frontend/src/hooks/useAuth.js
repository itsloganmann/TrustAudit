import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { me, signout as apiSignout } from "../lib/auth.js";

const AuthContext = createContext({
  user: null,
  loading: true,
  refresh: async () => {},
  signout: async () => {},
});

/**
 * Wrap your tree with this provider so any component can call useAuth().
 *
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const u = await me();
      setUser(u || null);
    } catch (err) {
      // Network or 5xx — surface as null but keep loading false.
      // eslint-disable-next-line no-console
      console.warn("[useAuth] me() failed", err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signout = useCallback(async () => {
    try {
      await apiSignout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = { user, loading, refresh, signout };
  return createElement(AuthContext.Provider, { value }, children);
}

/** React hook returning the current `{ user, loading, refresh, signout }`. */
export function useAuth() {
  return useContext(AuthContext);
}
