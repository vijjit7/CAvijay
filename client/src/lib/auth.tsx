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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

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
      }
    } catch (error) {
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
