/**
 * TypeScript interfaces mirroring the backend Pydantic models.
 * These form the typed contract between frontend and backend.
 *
 * Extended to cover all API schemas.
 */

// ─── Core Movie Types ──────────────────────────────────────────

export interface MovieRecord {
  id: string;
  title: string;
  genre: string[];
  rating: number | null;
  year: number | null;
  drive_url?: string;
  extra_fields: Record<string, unknown>;
  external_data?: ExternalData;
}

export interface ExternalData {
  overview: string;
  tagline?: string;
  director: string;
  cast: string[];
  popularity?: number;
  provider: string;
  poster_url?: string;
  imdb_url?: string;
  tmdb_url?: string;
  rotten_tomatoes_url?: string;
  letterboxd_url?: string;
}

/** Public API response (excludes extra_fields) */
export type MovieResponse = Omit<MovieRecord, 'extra_fields'>;

// ─── Stats Types ───────────────────────────────────────────────

export interface StatsResponse {
  total_movies: number;
  average_rating: number;
  rated_count: number;
  total_genres: number;
  top_genres: { genre: string; count: number }[];
  year_distribution: Record<string, number>;
  top_rated_movies: MovieResponse[];
}

// ─── Magic Search Types ────────────────────────────────────────

export interface AIMetadata {
  status: string;
  parsed_filters: {
    title?: string | null;
    genres: string[];
    min_rating: number | null;
    year: number | null;
  };
  provider: string;
  title?: string;
}

export interface MagicSearchResponse {
  movies: MovieResponse[];
  ai_metadata: AIMetadata;
  total_results: number;
}

// ─── Request Types ─────────────────────────────────────────────

export interface AddMovieRequest {
  title: string;
  genre: string[];
  rating: number | null;
  year: number | null;
  extra_fields?: Record<string, unknown>;
}

export interface FilterParams {
  title?: string;
  genres?: string[];
  min_rating?: number;
  year?: number | number[];
  max_results?: number;
}

// ─── Types (preserved) ─────────────────────────────────

export interface IngestionResult {
  total_raw_documents: number;
  total_valid_records: number;
  total_invalid_records: number;
  validation_errors: ValidationError[];
}

export interface ValidationError {
  index: number;
  error: string;
  raw_data_preview: Record<string, unknown>;
}

export interface HealthResponse {
  status: string;
  system: {
    memory_rss_mb: number;
    memory_vms_mb: number;
    cpu_percent: number;
  };
  ingestion: IngestionResult | { status: string };
  ai_gateway: {
    provider: string;
    circuit_open: boolean;
    consecutive_failures: number;
    api_key_configured: boolean;
  };
  config: {
    ai_provider: string;
    ai_timeout_seconds: number;
    google_drive_folder_id: string;
    cors_origins: string[];
  };
  external_services: {
    tmdb_configured: boolean;
    omdb_configured: boolean;
  };
}

export interface UserInfo {
  name: string;
  picture?: string;
  email?: string;
}

export interface IngestionStatusResponse {
  is_ingesting: boolean;
  total_movies: number;
  logs?: string[];
  user?: UserInfo;
}
