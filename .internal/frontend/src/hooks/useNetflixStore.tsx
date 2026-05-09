import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from "react";
import api from "../apiClient";
import type { MovieResponse, AddMovieRequest } from "../types";
import { useLibraryStats } from "./useLibraryStats";
import { useSearchFlow } from "./useSearchFlow";
import { useSystemStatus } from "./useSystemStatus";
import { useModals } from "./useModals";
import { AI_PROVIDER_OPTIONS } from "../constants/aiProviders";

export function useNetflixStore() {
  const [aiProvider, setAiProvider] = useState<string>("lm_studio");
  const [dashboardSyncToFilters, setDashboardSyncToFilters] = useState(false);
  const [newMovieIds, setNewMovieIds] = useState<Set<string>>(new Set());
  const [addedMovies, setAddedMovies] = useState<MovieResponse[]>([]);

  // 1. Domain Hooks
  const { stats, loadStats, statsError } = useLibraryStats();
  
  const {
    movies, aiMetadata, isLoading, setIsLoading, error, setError,
    hasSearched, activeFilters, currentSearchMode,
    searchAutocomplete, searchMagic, filter, clear, switchSearchMode, searchQueries, onMovieAdded
  } = useSearchFlow(aiProvider);

  // Re-define refreshStats with correct dependencies from other hooks
  const refreshStats = useCallback(async () => {
    await loadStats(dashboardSyncToFilters ? activeFilters : undefined);
  }, [activeFilters, dashboardSyncToFilters, loadStats]);

  const {
    isIngesting, ingestionLogs, user, systemStatus, statusError,
    openSystemStatusModal, closeSystemStatusModal, checkIngestionStatus,
    checkSystemHealth
  } = useSystemStatus(aiProvider, refreshStats);

  const {
    selectedMovie, setSelectedMovie,
    resultsModal, openModal, closeResultsModal
  } = useModals(stats, addedMovies);

  // ── Bridges and Effects ───────────────────────────────────────────

  // Sync effect
  useEffect(() => {
    void refreshStats();
  }, [dashboardSyncToFilters, refreshStats]);

  const addMovie = useCallback(async (movie: AddMovieRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.addMovie(movie) as MovieResponse;
      setNewMovieIds(prev => {
        const next = new Set(prev);
        next.add(result.id);
        return next;
      });
      setAddedMovies(prev => {
        if (prev.some(m => m.id === result.id)) return prev;
        return [...prev, result];
      });
      onMovieAdded(result);

      // Clear new status after 5 minutes
      setTimeout(() => {
        setNewMovieIds(prev => {
          const next = new Set(prev);
          next.delete(result.id);
          return next;
        });
        setAddedMovies(prev => prev.filter(m => m.id !== result.id));
      }, 5 * 60 * 1000);
      return result;
    } catch (err) {
      setError(String(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setError, onMovieAdded]);

  return {
    movies, stats, aiMetadata, aiProvider, isLoading, error: error || statsError || statusError,
    activeFilters, dashboardSyncToFilters, isIngesting, ingestionLogs, user, hasSearched,
    newMovieIds, addedMovies,
    selectedMovie, setSelectedMovie,
    resultsModal, openModal, closeResultsModal,
    systemStatus, openSystemStatusModal, closeSystemStatusModal,
    searchAutocomplete, searchMagic, filter, addMovie, clear,
    setAiProvider, setDashboardSyncToFilters, 
    refreshStats, 
    checkIngestionStatus,
    checkSystemHealth,
    switchSearchMode,
    currentSearchMode,
    searchQueries,
    shutdown: async () => {
      try { await api.shutdown(); }
      catch { /* Shutdown requested, connection will drop */ }
    },
    aiProviderOptions: AI_PROVIDER_OPTIONS,
  };
}

type NetflixStore = ReturnType<typeof useNetflixStore>;
const NetflixContext = createContext<NetflixStore | null>(null);

export function NetflixProvider({ children }: { children: ReactNode }) {
  const store = useNetflixStore();
  return (
    <NetflixContext.Provider value={store}>
      {children}
    </NetflixContext.Provider>
  );
}

export function useNetflix() {
  const context = useContext(NetflixContext);
  if (!context) throw new Error("useNetflix must be used within a NetflixProvider");
  return context;
}
