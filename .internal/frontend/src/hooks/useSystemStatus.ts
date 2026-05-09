import { useState, useCallback, useEffect } from "react";
import api from "../apiClient";
import type { HealthResponse, UserInfo } from "../types";

export function useSystemStatus(aiProvider: string, refreshStats: () => Promise<void>) {
  const [isIngesting, setIsIngesting] = useState(true);
  const [ingestionLogs, setIngestionLogs] = useState<string[]>([]);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [systemStatus, setSystemStatus] = useState<{
    isOpen: boolean;
    health: HealthResponse | null;
    isLoading: boolean;
  }>({
    isOpen: false,
    health: null,
    isLoading: false,
  });

  const checkSystemHealth = useCallback(async () => {
    try {
      const health = await api.getHealth(aiProvider);
      setSystemStatus(prev => ({ ...prev, health }));
      setError(null);
    } catch {
      // Health check failed
    }
  }, [aiProvider]);

  const checkIngestionStatus = useCallback(async () => {
    try {
      const status = await api.getIngestionStatus();
      setIngestionLogs(Array.isArray(status.logs) ? status.logs : []);
      if (status.user) setUser(status.user);
      setError(null);

      if (!status.is_ingesting) {
        setIsIngesting(false);
        await refreshStats();
      }
    } catch {
      setError("Waiting for backend service to stabilize...");
    }
  }, [refreshStats]);

  useEffect(() => {
    // Initial check
    const runInitialChecks = () => {
      void checkIngestionStatus();
      void checkSystemHealth();
    };
    
    runInitialChecks();
    
    // Adaptive polling: 1s during ingestion, 5s otherwise
    const intervalTime = isIngesting ? 1000 : 5000;
    const interval = setInterval(() => {
      void checkIngestionStatus();
      void checkSystemHealth();
    }, intervalTime);
    
    return () => clearInterval(interval);
  }, [checkIngestionStatus, checkSystemHealth, isIngesting]);

  const openSystemStatusModal = useCallback(async () => {
    setSystemStatus(prev => ({ ...prev, isOpen: true, isLoading: true }));
    try {
      const [health, ingestionStatus] = await Promise.all([
        api.getHealth(aiProvider),
        api.getIngestionStatus()
      ]);
      setIngestionLogs(Array.isArray(ingestionStatus.logs) ? ingestionStatus.logs : []);
      setSystemStatus(prev => ({ ...prev, health, isLoading: false }));
    } catch {
      setSystemStatus(prev => ({ ...prev, isLoading: false }));
    }
  }, [aiProvider]);

  const closeSystemStatusModal = useCallback(() => {
    setSystemStatus(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    isIngesting, ingestionLogs, user, systemStatus, statusError: error,
    checkIngestionStatus, checkSystemHealth, openSystemStatusModal, closeSystemStatusModal
  };
}
