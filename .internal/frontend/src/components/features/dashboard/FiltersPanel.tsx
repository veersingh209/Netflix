import "../../ui/Dashboard.css";
import "../../ui/Search.css";
/**
 * FiltersPanel — Technical API controls for granular filtering.
 *
 * Exposes dropdowns for genre, inputs for year and min_rating,
 * mapping directly to /api/movies/filter query parameters.
 */

import { useState, type FormEvent } from "react";
import type { FilterParams } from "../../../types";
import { useCopyApi } from "../../../hooks/useCopyApi";
import { useNetflix } from "../../../hooks/useNetflixStore";

interface FiltersPanelProps {
  onReset?: () => void;
}

const COMMON_GENRES = [
  "Action", "Adventure", "Animation", "Comedy", "Crime",
  "Documentary", "Drama", "Family", "Fantasy", "History",
  "Horror", "Music", "Mystery", "Romance", "Sci-Fi",
  "Thriller", "War", "Western",
];


export function FiltersPanel({
  onReset,
}: FiltersPanelProps) {
  const {
    filter: onFilter,
    isLoading,
    stats,
    dashboardSyncToFilters,
    setDashboardSyncToFilters,
  } = useNetflix();

  const onDashboardSyncToggle = setDashboardSyncToFilters;
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [minRating, setMinRating] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [isExpanded, setIsExpanded] = useState(true);
  const { copyText, copyFeedback } = useCopyApi();

  // Build genre list from stats if available, else use common genres
  const availableGenres = stats?.top_genres && Array.isArray(stats.top_genres)
    ? [...new Set([
        ...stats.top_genres.map((g) => g.genre),
        ...COMMON_GENRES,
      ])].sort()
    : COMMON_GENRES;

  const toggleGenre = (genre: string) => {
    setSelectedGenres((prev) =>
      prev.includes(genre)
        ? prev.filter((g) => g !== genre)
        : [...prev, genre],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const params: FilterParams = {};

    if (selectedGenres.length > 0) {
      params.genres = selectedGenres;
    }
    if (minRating) {
      params.min_rating = parseFloat(minRating);
    }
    if (year) {
      params.year = parseInt(year, 10);
    }

    await onFilter(params);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedGenres([]);
    setMinRating("");
    setYear("");
    onReset?.();
  };

  const hasFilters = selectedGenres.length > 0 || minRating || year;

  const buildFilterApiLink = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
    const searchParams = new URLSearchParams();

    if (selectedGenres.length > 0) {
      selectedGenres.forEach((genre) => {
        searchParams.append("genres", genre);
      });
    }
    if (minRating) {
      searchParams.set("min_rating", minRating);
    }
    if (year) {
      searchParams.set("year", year);
    }

    const queryString = searchParams.toString();
    return `${baseUrl}/api/movies/filter${queryString ? `?${queryString}` : ""}`;
  };

  const handleCopyApiLink = () => {
    copyText(buildFilterApiLink());
  };

  return (
    <section className="filters-panel animate-fade-in-up" id="filters-panel">
      {isExpanded ? (
        <div className="glass-card">
          <div
            className="filters-header"
            onClick={() => setIsExpanded(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setIsExpanded(false)}
          >
            <h2 className="section-title" style={{ margin: 0 }}>
              <span className="section-icon">🔧</span>
              Advanced Filters
              <span className="badge badge-info" style={{ marginLeft: 8 }}>Technical API</span>
            </h2>
            <span className="filters-chevron expanded">
              ▾
            </span>
          </div>

          <form onSubmit={handleSubmit} className="filters-form">
          {/* ─── Genre Selection ─────────────────────────── */}
          <div className="filter-group">
            <label className="filter-label">Genre(s)</label>
            <div className="filter-sublabel">AND logic — selecting multiple narrows results</div>
            <div className="genre-chips">
              {availableGenres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  className={`genre-chip ${selectedGenres.includes(genre) ? "selected" : ""}`}
                  onClick={() => toggleGenre(genre)}
                >
                  {genre}
                  {stats?.top_genres?.find((g) => g.genre === genre) && (
                    <span className="genre-chip-count">
                      {stats.top_genres.find((g) => g.genre === genre)?.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Min Rating ──────────────────────────────── */}
          <div className="filter-row">
            <div className="filter-group">
              <label className="filter-label" htmlFor="filter-min-rating">
                Minimum Rating
              </label>
              <div className="filter-input-wrapper">
                <input
                  id="filter-min-rating"
                  type="number"
                  className="filter-input"
                  placeholder="0.0"
                  min="0"
                  max="10"
                  step="0.5"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                />
                <span className="filter-input-unit">/ 10</span>
              </div>
            </div>

            {/* ─── Year ───────────────────────────────────── */}
            <div className="filter-group">
              <label className="filter-label" htmlFor="filter-year">
                Release Year
              </label>
              <div className="filter-input-wrapper">
                <input
                  id="filter-year"
                  type="number"
                  className="filter-input"
                  placeholder="e.g. 1999"
                  min="1888"
                  max="2030"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* ─── Actions ──────────────────────────────────── */}
          <div className="filter-actions">
            <label className="search-control-toggle toggle-switch" htmlFor="filter-sync-dashboard-toggle-expanded" style={{ marginRight: 'auto', alignSelf: 'center' }}>
              <input
                id="filter-sync-dashboard-toggle-expanded"
                type="checkbox"
                checked={dashboardSyncToFilters}
                onChange={(e) => onDashboardSyncToggle(e.target.checked)}
              />
              <span className="toggle-slider"></span>
              <span className="toggle-label">
              Sync Dashboard to Filters
              {dashboardSyncToFilters && (
                <span className="sync-indicator">● Active</span>
              )}
            </span>
            </label>
            <button
              type="button"
              className="copy-api-link-btn"
              onClick={handleCopyApiLink}
              title="Copy the filter API endpoint"
            >
              {copyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
            </button>
            <button
              type="submit"
              className="filter-apply-btn"
              disabled={isLoading || !hasFilters}
              id="filter-apply-btn"
            >
              {isLoading ? (
                <>
                  <div className="spinner spinner-sm" />
                  Filtering...
                </>
              ) : (
                <>Apply Filters</>
              )}
            </button>
            {hasFilters && (
              <button
                type="button"
                className="filter-reset-btn"
                onClick={(e) => handleReset(e)}
                id="filter-reset-btn"
              >
                Reset
              </button>
            )}
          </div>
        </form>
        </div>
      ) : (
        <div
          className="filters-header glass-card filters-header-collapsed"
          onClick={() => setIsExpanded(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setIsExpanded(true)}
        >
          <h2 className="section-title" style={{ margin: 0 }}>
            <span className="section-icon">🔧</span>
            Advanced Filters
            <span className="badge badge-info" style={{ marginLeft: 8 }}>Technical API</span>
            {hasFilters && (
              <span className="badge badge-active" style={{ marginLeft: 8 }}>
                {selectedGenres.length + (minRating ? 1 : 0) + (year ? 1 : 0)} active
              </span>
            )}
          </h2>
          <div className="filters-header-actions">
            <span className="filters-chevron">
              ▾
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
