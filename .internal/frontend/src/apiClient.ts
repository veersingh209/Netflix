/**
 * API client for the Netflix Movie Library Explorer backend.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8002";

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API Error ${status}: ${statusText}`);
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  // Add cache-busting timestamp to prevent stale browser caches for GET requests
  const url = `${API_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}_t=${Date.now()}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  
  
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, data);
  }

  return data as T;
}

function buildSearchParams(params: Record<string, unknown> | FilterParams): URLSearchParams {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => searchParams.append(key, String(v)));
    } else {
      searchParams.set(key, String(value));
    }
  });
  return searchParams;
}

// ─── Typed API Methods ────────────────────────────────────────────

import type {
  AddMovieRequest,
  FilterParams,
  HealthResponse,
  IngestionStatusResponse,
  MagicSearchResponse,
  MovieResponse,
  StatsResponse,
} from "./types";

export const api = {
  // ── System endpoints ────────────────────────────────

  /** Health check with system diagnostics */
  getHealth: (aiProvider?: string) => 
    request<HealthResponse>(`/health?${buildSearchParams({ ai_provider: aiProvider }).toString()}`),

  /** Detailed ingestion status and sample records */
  getIngestionStatus: () =>
    request<IngestionStatusResponse>("/api/ingestion/status"),

  /** Shutdown the entire application stack */
  shutdown: () => request<{ message: string }>("/api/system/shutdown", { method: "POST" }),

  /** Update API key for AI provider */
  updateApiKey: (provider: string, apiKey: string) =>
    request<{ message: string; provider: string }>(
      `/api/config/api-key?${buildSearchParams({ provider, api_key: apiKey }).toString()}`,
      { method: "POST" }
    ),

  // ── Movie endpoints ─────────────────────────────────

  /** Trie-backed autocomplete and substring search */
  searchMovies: (prefix: string, maxResults = 20) =>
    request<MovieResponse[]>(
      `/api/movies/search?${buildSearchParams({ q: prefix, max_results: maxResults }).toString()}`,
    ),

  /** Inverted index multi-criteria filter */
  filterMovies: (params: FilterParams) => {
    return request<MovieResponse[]>(
      `/api/movies/filter?${buildSearchParams(params).toString()}`,
    );
  },

  /** Dashboard statistics */
  getStats: () => request<StatsResponse>("/api/stats"),

  /** All unique genres in the library */
  getStatsGenres: () => request<string[]>("/api/stats/genres"),

  /** Dashboard statistics scoped to active filters */
  getFilteredStats: (params: FilterParams) => {
    return request<StatsResponse>(
      `/api/stats/filter?${buildSearchParams(params).toString()}`,
    );
  },

  /** AI-powered natural language search */
  magicSearch: (query: string, aiProvider?: string) => {
    return request<MagicSearchResponse>(
      `/api/magic-search?${buildSearchParams({ q: query, ai_provider: aiProvider }).toString()}`,
    );
  },

  /** Add a new movie to the in-memory repository */
  addMovie: (movie: AddMovieRequest) =>
    request<MovieResponse>("/api/movies/add", {
      method: "POST",
      body: JSON.stringify(movie),
    }),

  /** Trigger AI-powered metadata enrichment for a movie */
  enrichMovie: (movieId: string, aiProvider?: string, force = false) => {
    const params = buildSearchParams({ 
      ai_provider: aiProvider,
      force: force
    }).toString();
    return request<MovieResponse>(`/api/movies/${movieId}/enrich${params ? `?${params}` : ""}`, { method: "POST" });
  },
} as const;

export { ApiError };
export default api;
