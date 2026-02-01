import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import type { Report, User } from "@shared/schema";

interface AuditContextType {
  reports: Report[];
  associates: User[];
  loading: boolean;
  addReport: (report: Omit<Report, "id" | "createdAt">) => Promise<Report | null>;
  getReport: (id: string) => Promise<Report | null>;
  deleteReport: (id: string) => Promise<boolean>;
  refreshReports: (filters?: { associateId?: string; status?: string; month?: number; year?: number }) => Promise<void>;
}

const AuditContext = createContext<AuditContextType | null>(null);

export function AuditProvider({ children }: { children: ReactNode }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [associates, setAssociates] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      await Promise.all([
        refreshReports(),
        loadAssociates(),
      ]);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssociates = async () => {
    try {
      const response = await fetch('/api/associates', {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        setAssociates(data);
      }
    } catch (error) {
      console.error('Failed to load associates:', error);
    }
  };

  const refreshReports = async (filters?: { associateId?: string; status?: string; month?: number; year?: number }) => {
    try {
      const params = new URLSearchParams();
      if (filters?.associateId) params.append('associateId', filters.associateId);
      if (filters?.status) params.append('status', filters.status);
      if (filters?.month) params.append('month', filters.month.toString());
      if (filters?.year) params.append('year', filters.year.toString());

      const url = `/api/reports${params.toString() ? `?${params.toString()}` : ''}`;
      console.log('[DEBUG] Fetching reports from:', url);
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[DEBUG] Received reports count:', data?.length || 0);
        setReports(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('[DEBUG] Reports fetch failed with status:', response.status, 'Details:', errorData);
      }
    } catch (error) {
      console.error('Failed to load reports:', error);
    }
  };

  const addReport = async (report: Omit<Report, "id" | "createdAt">): Promise<Report | null> => {
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
        credentials: 'include',
      });

      if (response.ok) {
        const newReport = await response.json();
        setReports(prev => [newReport, ...prev]);
        return newReport;
      }
      
      return null;
    } catch (error) {
      console.error('Failed to add report:', error);
      return null;
    }
  };

  const getReport = async (id: string): Promise<Report | null> => {
    try {
      const response = await fetch(`/api/reports/${id}`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        return await response.json();
      }
      
      return null;
    } catch (error) {
      console.error('Failed to get report:', error);
      return null;
    }
  };

  const deleteReport = async (id: string): Promise<boolean> => {
    try {
      const response = await fetch(`/api/reports/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (response.ok) {
        setReports(prev => prev.filter(r => r.id !== id));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Failed to delete report:', error);
      return false;
    }
  };

  return (
    <AuditContext.Provider value={{ reports, associates, loading, addReport, getReport, deleteReport, refreshReports }}>
      {children}
    </AuditContext.Provider>
  );
}

export function useAudit() {
  const context = useContext(AuditContext);
  if (!context) {
    throw new Error("useAudit must be used within an AuditProvider");
  }
  return context;
}
