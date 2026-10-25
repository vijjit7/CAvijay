import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import type { User as SchemaUser } from "@shared/schema";
import { isOfficeAssociate } from "@shared/schema";

interface User extends SchemaUser {
  isAdmin?: boolean;
  isApprover?: boolean;
  mustChangePassword?: boolean;
}

interface ChangePasswordResult {
  success: boolean;
  error?: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<ChangePasswordResult>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Persist the logged-in associate locally so the installed PWA reopens
// straight into the app (no login-page flash) and keeps them signed in while
// the session cookie is re-validated in the background.
const STORED_USER_KEY = "auditguard.user";

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(STORED_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function writeStoredUser(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(STORED_USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORED_USER_KEY);
    }
  } catch {
    // Ignore storage failures (private mode / quota) — session cookie still rules.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Hydrate synchronously from the last known associate so the first render
  // already shows the app for a returning user instead of the login screen.
  const [user, setUserState] = useState<User | null>(() => readStoredUser());
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  // Keep local storage in lockstep with the in-memory user. Accepts either a
  // value or a functional updater, matching React's setState signature.
  const setUser = (next: User | null | ((prev: User | null) => User | null)) => {
    setUserState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: User | null) => User | null)(prev) : next;
      writeStoredUser(resolved);
      return resolved;
    });
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/user', {
        credentials: 'include',
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else if (response.status === 401 || response.status === 403) {
        // Session genuinely gone — drop the cached associate and sign out.
        setUser(null);
      }
      // Other statuses (e.g. 5xx) keep the cached user so a flaky server
      // doesn't bounce an associate to the login screen.
    } catch (error) {
      // Network error (offline): keep the cached associate signed in.
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username: string, password: string) => {
    console.log('Login function called with:', username);
    try {
      console.log('Making fetch request to /api/login');
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      });

      console.log('Response status:', response.status);

      if (response.ok) {
        const userData = await response.json();
        console.log('Login successful:', userData);
        setUser(userData);

        // Redirect based on user role or ID
        if (userData.id === 'ADMIN') {
          setLocation('/');
        } else if (userData.id === 'PROP') {
          setLocation('/office-costing');
        } else if (isOfficeAssociate(userData)) {
          setLocation('/bill');
        } else {
          setLocation('/upload');
        }

        return true;
      }

      const errorData = await response.json();
      console.log('Login failed with response:', errorData);
      return false;
    } catch (error) {
      console.error('Login failed with exception:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout failed:', error);
    } finally {
      setUser(null);
      setLocation('/login');
    }
  };

  const changePassword = async (
    currentPassword: string,
    newPassword: string
  ): Promise<ChangePasswordResult> => {
    try {
      const response = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
        credentials: 'include',
      });

      if (response.ok) {
        setUser((prev) => (prev ? { ...prev, mustChangePassword: false } : prev));
        return { success: true };
      }

      const data = await response.json().catch(() => ({}));
      return { success: false, error: data?.error || 'Failed to change password' };
    } catch (error) {
      console.error('Change password failed:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, changePassword, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
