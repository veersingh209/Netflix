import { useState, useCallback, useRef, useEffect } from "react";
import api from "../apiClient";
import type { MovieResponse, AIMetadata, FilterParams } from "../types";

const normalizeFilters = (params: FilterParams): FilterParams => {
  const next: FilterParams = {};
  if (params.title) next.title = params.title;
  if (params.genres?.length) next.genres = params.genres;
  if (params.min_rating !== undefined) next.min_rating = params.min_rating;
  if (params.year !== undefined) next.year = params.year;
  return next;
};

const parseAutocompleteQuery = (query: string): FilterParams => {
  const filters: FilterParams = {};
  
  // Extract year patterns (e.g., "2020", "movies from 2020")
  const yearMatch = query.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    filters.year = parseInt(yearMatch[0], 10);
  }
  
  // Extract rating patterns (e.g., "rating 8", "8.5", "above 7")
  const ratingMatch = query.match(/\b(\d+(?:\.\d+)?)\b/);
  if (ratingMatch) {
    const rating = parseFloat(ratingMatch[0]);
    if (rating >= 0 && rating <= 10) {
      filters.min_rating = rating;
    }
  }
  
  // Extract common genre keywords
  const genres = ["action", "adventure", "animation", "comedy", "crime", "documentary", "drama", "family", "fantasy", "history", "horror", "music", "mystery", "romance", "sci-fi", "thriller", "war", "western"];
  const foundGenres = genres.filter(genre => 
    query.toLowerCase().includes(genre.toLowerCase())
  );
  if (foundGenres.length > 0) {
    filters.genres = foundGenres;
  }
  
  // Use the full query as title filter if no specific filters found
  if (Object.keys(filters).length === 0) {
    filters.title = query;
  }
  
  return filters;
};

export function useSearchFlow(aiProvider: string) {
  const [movies, setMovies] = useState<MovieResponse[]>([]);
  const [aiMetadata, setAiMetadata] = useState<AIMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [activeFilters, setActiveFilters] = useState<FilterParams>({});
  const [currentSearchMode, setCurrentSearchMode] = useState<"autocomplete" | "magic">("autocomplete");
  const [currentAiProvider, setCurrentAiProvider] = useState(aiProvider);

  // Update internal aiProvider when external aiProvider changes
  useEffect(() => {
    if (currentAiProvider !== aiProvider) {
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => setCurrentAiProvider(aiProvider), 0);
    }
  }, [aiProvider, currentAiProvider]);

  const [searchResults, setSearchResults] = useState<{
    autocomplete: { movies: MovieResponse[]; hasSearched: boolean; query: string };
    magic: { movies: MovieResponse[]; aiMetadata: AIMetadata | null; hasSearched: boolean; query: string };
  }>({
    autocomplete: { movies: [], hasSearched: false, query: "" },
    magic: { movies: [], aiMetadata: null, hasSearched: false, query: "" }
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeSearch = async (fetcher: () => Promise<void>): Promise<void> => {
    setIsLoading(true);
    setError(null);
    setMovies([]);
    try { await fetcher(); }
    catch (err) { setError(String(err)); }
    finally { setIsLoading(false); }
  };

  const clear = useCallback(() => {
    if (currentSearchMode === "autocomplete") {
      setSearchResults(prev => ({ ...prev, autocomplete: { movies: [], hasSearched: false, query: "" } }));
    } else {
      setSearchResults(prev => ({ ...prev, magic: { movies: [], aiMetadata: null, hasSearched: false, query: "" } }));
    }
    setMovies([]);
    setAiMetadata(null);
    setActiveFilters({});
    setHasSearched(false);
    setError(null);
  }, [currentSearchMode]);

  const searchAutocomplete = useCallback((prefix: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!prefix.trim()) return clear();

    debounceRef.current = setTimeout(() => {
      executeSearch(async () => {
        const results = await api.searchMovies(prefix.trim());
        setMovies(results);
        setAiMetadata(null);
        
        // Parse basic filter info from autocomplete query for dashboard sync
        const parsedFilters = parseAutocompleteQuery(prefix.trim());
        setActiveFilters(parsedFilters);
        
        setHasSearched(true);
        setSearchResults(prev => ({
          ...prev,
          autocomplete: { movies: results, hasSearched: true, query: prefix.trim() }
        }));
      });
    }, 200);
  }, [clear]);

  const searchMagic = useCallback((query: string, providerOverride?: string): Promise<void> => {
    if (!query.trim()) {
      clear();
      return Promise.resolve();
    }
    return executeSearch(async () => {
      const selectedProvider = providerOverride ?? currentAiProvider;
      const res = await api.magicSearch(query, selectedProvider);
      setAiMetadata(res.ai_metadata);

      if (res.ai_metadata?.status === "connection_error") {
        setMovies([]);
        setActiveFilters({});
        setSearchResults(prev => ({
          ...prev,
          magic: { movies: [], aiMetadata: res.ai_metadata, hasSearched: true, query }
        }));
      } else {
        setMovies(res.movies);
        const parsed = res.ai_metadata?.parsed_filters;
        setActiveFilters(normalizeFilters({
          title: parsed?.title ?? undefined,
          genres: parsed?.genres ?? [],
          min_rating: parsed?.min_rating ?? undefined,
          year: parsed?.year ?? undefined,
        }));
        setSearchResults(prev => ({
          ...prev,
          magic: { movies: res.movies, aiMetadata: res.ai_metadata, hasSearched: true, query }
        }));
      }
      setHasSearched(true);
    });
  }, [currentAiProvider, clear]);

  const filter = useCallback((params: FilterParams): Promise<void> => {
    return executeSearch(async () => {
      setMovies(await api.filterMovies(params));
      setAiMetadata(null);
      setActiveFilters(normalizeFilters(params));
      setHasSearched(true);
    });
  }, []);

  const onMovieAdded = useCallback((_movie: MovieResponse) => {
    // We don't manually inject into search results anymore 
    // to avoid double-display with the 'Recently Added' section.
    // The backend index handles newly added movies automatically.
    // Parameter is unused but kept for interface consistency
    void _movie; // Explicitly mark as unused
  }, []);

  const switchSearchMode = useCallback((mode: "autocomplete" | "magic") => {
    setCurrentSearchMode(mode);
    const modeResults = searchResults[mode];
    setMovies(modeResults.movies);
    setAiMetadata(mode === "magic" ? (modeResults as typeof searchResults.magic).aiMetadata : null);
    setHasSearched(modeResults.hasSearched);
    if (mode === "autocomplete") setActiveFilters({});
  }, [searchResults]);

  return {
    movies, setMovies, aiMetadata, setAiMetadata, isLoading, setIsLoading, error, setError,
    hasSearched, setHasSearched, activeFilters, setActiveFilters, currentSearchMode,
    searchAutocomplete, searchMagic, filter, clear, switchSearchMode, onMovieAdded,
    searchQueries: {
      autocomplete: searchResults.autocomplete.query,
      magic: searchResults.magic.query,
    }
  };
}
