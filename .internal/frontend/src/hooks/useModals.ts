import { useState, useCallback } from "react";
import api from "../apiClient";
import type { MovieResponse, FilterParams, StatsResponse } from "../types";

export function useModals(stats: StatsResponse | null, addedMovies: MovieResponse[] = []) {
  const [selectedMovie, setSelectedMovie] = useState<MovieResponse | null>(null);
  const [resultsModal, setResultsModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    movies: MovieResponse[];
    isLoading: boolean;
    genres?: string[];
    genreCounts?: { genre: string; count: number }[];
  }>({
    isOpen: false,
    title: "",
    description: "",
    movies: [],
    isLoading: false,
  });

  const mergeAddedMovies = useCallback((results: MovieResponse[], params?: FilterParams): MovieResponse[] => {
    if (addedMovies.length === 0) return results;

    const resultIds = new Set(results.map(m => m.id));

    const newItems = addedMovies.filter(m => {
      // Avoid exact ID duplicates
      if (resultIds.has(m.id)) return false;

      if (!params || Object.keys(params).length === 0) return true; // "All Movies"

      // Match against filters
      if (params.year !== undefined) {
        const years = Array.isArray(params.year) ? params.year : [params.year];
        if (!years.includes(m.year || 0)) return false;
      }
      if (params.min_rating !== undefined && (m.rating === null || m.rating < params.min_rating)) return false;
      if (params.genres && params.genres.length > 0) {
        if (!m.genre.some(g => params.genres?.includes(g))) return false;
      }
      if (params.title && !m.title.toLowerCase().includes(params.title.toLowerCase())) return false;

      return true;
    });

    if (newItems.length === 0) return results;

    // Combine and sort (rating desc, title asc)
    return [...results, ...newItems].sort((a, b) => {
      const rA = a.rating ?? 0;
      const rB = b.rating ?? 0;
      if (rB !== rA) return rB - rA;
      return a.title.localeCompare(b.title);
    });
  }, [addedMovies]);

  const mergeAddedGenres = useCallback((results: string[]): string[] => {
    if (addedMovies.length === 0) return results;

    const genreSet = new Set(results.map(g => g.toLowerCase()));
    const newGenres: string[] = [];

    addedMovies.forEach(m => {
      m.genre.forEach(g => {
        if (!genreSet.has(g.toLowerCase())) {
          genreSet.add(g.toLowerCase());
          newGenres.push(g.charAt(0).toUpperCase() + g.slice(1).toLowerCase());
        }
      });
    });

    return [...results, ...newGenres].sort((a, b) => a.localeCompare(b));
  }, [addedMovies]);

  const openModal = useCallback(async (type: "movies" | "genres", title: string, description: string, params?: FilterParams) => {
    setResultsModal({
      isOpen: true,
      title,
      description,
      movies: [],
      isLoading: true,
      genres: undefined,
    });

    try {
      if (type === "movies") {
        const filterParams = { ...(params || {}), max_results: 500 };
        const results = await api.filterMovies(filterParams);
        const merged = mergeAddedMovies(results, params);
        setResultsModal(prev => ({ ...prev, movies: merged, isLoading: false }));
      } else if (type === "genres") {
        const fetchedGenres = await api.getStatsGenres();
        const mergedGenres = mergeAddedGenres(fetchedGenres);
        const genreCounts = stats?.top_genres || [];
        setResultsModal(prev => ({ ...prev, genres: mergedGenres, genreCounts, isLoading: false }));
      }
    } catch (err) {
      console.error("Failed to open modal:", err);
      setResultsModal(prev => ({ ...prev, isLoading: false }));
    }
  }, [stats, mergeAddedMovies, mergeAddedGenres]);

  const closeResultsModal = useCallback(() => {
    setResultsModal(prev => ({ ...prev, isOpen: false }));
  }, []);

  return {
    selectedMovie, setSelectedMovie,
    resultsModal, openModal, closeResultsModal
  };
}
