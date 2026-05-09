import { useState, useCallback } from "react";
import api from "../apiClient";
import type { StatsResponse, FilterParams } from "../types";

export function useLibraryStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (filters?: FilterParams) => {
    try {
      if (filters && (filters.genres?.length || filters.min_rating !== undefined || filters.year !== undefined || filters.title)) {
        setStats(await api.getFilteredStats(filters));
      } else {
        setStats(await api.getStats());
      }
      setError(null);
    }
    catch (err) { setError(String(err)); }
  }, []);

  return { stats, setStats, loadStats, statsError: error };
}
