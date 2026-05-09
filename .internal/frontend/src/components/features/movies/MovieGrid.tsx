import { useMemo, useEffect } from "react";
import "../../ui/Movies.css";
import type { MovieResponse } from "../../../types";
import { useNetflix } from "../../../hooks/useNetflixStore";
import { SortControls } from "../../ui/SortControls";
import { useSorting } from "../../../hooks/useSorting";

interface MovieGridProps {
  movies?: MovieResponse[]; // Optional override, defaults to store movies
  resultLabel?: string;
}

const NO_RESULTS_MESSAGES = [
  "No movies found in this cinematic dimension...",
  "The inverted index returned empty results...",
  "Trie traversal completed with zero matches...",
  "Filter combination too specific for this universe...",
  "Quantum movie database has no entries here...",
  "The cinematic void echoes with silence...",
  "No films survived the great filter...",
  "The movie matrix has no matching rows...",
  "Cinematic coordinates returned null...",
  "The algorithm found no worthy candidates...",
];


const getRandomNoResultsMessage = () => {
  return NO_RESULTS_MESSAGES[Math.floor(Math.random() * NO_RESULTS_MESSAGES.length)];
};

export function MovieGrid({ movies: propMovies, resultLabel }: MovieGridProps) {
  const {
    movies: storeMovies,
    isLoading,
    error,
    hasSearched,
    newMovieIds,
    setSelectedMovie
  } = useNetflix();

  const sourceMovies = propMovies ?? storeMovies;
  const onMovieClick = setSelectedMovie;

  // 1. Unified Sorting Hook
  const {
    sortKey,
    sortOrder,
    isSorting,
    sortedItems: sortedMovies,
    toggleSort,
    setSortKey
  } = useSorting(sourceMovies, { defaultSortKey: "rating" });

  const isYearSortMeaningful = useMemo(() => {
    if (sourceMovies.length <= 1) return false;
    const firstYear = sourceMovies[0].year;
    return sourceMovies.some(m => m.year !== firstYear);
  }, [sourceMovies]);

  useEffect(() => {
    if (sortKey === "year" && !isYearSortMeaningful) {
      setSortKey("rating");
    }
  }, [sortKey, isYearSortMeaningful, setSortKey]);

  // Count duplicate titles for visual indication
  const titleCounts = useMemo(() => {
    const counts = new Map<string, number>();
    sourceMovies.forEach((movie) => {
      const normalizedTitle = movie.title.toLowerCase().trim();
      counts.set(normalizedTitle, (counts.get(normalizedTitle) || 0) + 1);
    });
    return counts;
  }, [sourceMovies]);

  if (error) {
    return (
      <div className="movie-grid-error glass-card animate-fade-in">
        <span className="error-icon">⚠️</span>
        <span>{error}</span>
      </div>
    );
  }

  const showSkeletons = isLoading && sourceMovies.length === 0;

  if (showSkeletons) {
    return (
      <div className="movie-grid-section" id="movie-grid">
        <div className="movie-grid-header">
          <h2 className="section-title"><span className="section-icon">🎬</span>Results</h2>
        </div>
        <div className="movie-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-card movie-card skeleton">
              <div className="skeleton-title" />
              <div className="skeleton-genres" />
              <div className="skeleton-meta" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (sourceMovies.length === 0 && !isLoading) {
    const showNoResults = hasSearched; // Only show "No Movies Found" if user actually searched
    const noResultsMessage = getRandomNoResultsMessage();

    return (
      <div className="movie-grid-section animate-fade-in-up" id="movie-grid">
        <div className="movie-grid-header">
          <h2 className="section-title"><span className="section-icon">{resultLabel === "Recently Added" ? "🆕" : "🎬"}</span>{resultLabel || "Results"}</h2>
          <span className="result-count">0 movies</span>
        </div>
        <div className="movie-grid-empty glass-card">
          <div className="empty-icon">{showNoResults ? "🔍" : "🎬"}</div>
          <div className="empty-title">{showNoResults ? "No Movies Found" : "Ready to Explore"}</div>
          <div className="empty-message">
            {showNoResults ? noResultsMessage : "Your movie collection is ready to explore."}
          </div>
          <div className="empty-suggestion">
            {showNoResults
              ? "Try adjusting your filters or search terms to explore the cinematic universe."
              : "Use the search bar above or filters to discover movies."
            }
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`movie-grid-section animate-fade-in-up ${isLoading ? "is-loading" : ""}`} id="movie-grid">
      <div className="movie-grid-header">
        <h2 className="section-title"><span className="section-icon">{resultLabel === "Recently Added" ? "🆕" : "🎬"}</span>{resultLabel || "Results"}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {sourceMovies.length > 1 && (
            <SortControls
              sortKey={sortKey}
              sortOrder={sortOrder}
              onSortChange={toggleSort}
              isSorting={isSorting}
              availableSorts={isYearSortMeaningful ? ['rating', 'year', 'title'] : ['rating', 'title']}
            />
          )}
          <span className="result-count">{sourceMovies.length} movie{sourceMovies.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
      <div className="movie-grid stagger-children">
        {sortedMovies.map((movie, idx) => {
          const shouldAnimate = isSorting;
          const hue = movie.title.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
          const normalizedTitle = movie.title.toLowerCase().trim();
          const duplicateCount = titleCounts.get(normalizedTitle) || 1;
          const hasDuplicates = duplicateCount > 1;
          const isNew = newMovieIds.has(movie.id);

          return (
            <div
              className={`glass-card movie-card${hasDuplicates ? " has-duplicate" : ""}${isNew ? " is-new" : ""} ${shouldAnimate ? `sort-animation sort-animation-stagger-${Math.min(idx + 1, 5)}` : ''}`}
              key={movie.id}
              id={`movie-${movie.id.slice(0, 8)}`}
              onClick={() => onMovieClick(movie)}
              style={{ cursor: "pointer", transition: "transform 0.2s" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.zIndex = "10";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "";
                e.currentTarget.style.zIndex = "";
              }}
              title={hasDuplicates ? `${duplicateCount} copies in library` : isNew ? "Just added!" : undefined}
            >
              {isNew && (
                <span className="new-badge">NEW</span>
              )}
              <div className="movie-card-accent" style={{ background: `linear-gradient(135deg, hsl(${hue},70%,40%), hsl(${(hue + 60) % 360},60%,30%))` }} />
              <div className="movie-card-content">
                <h3 className="movie-card-title">
                  {movie.title}
                </h3>
                <div className="movie-card-genres">
                  {movie.genre.map((g) => (<span key={g} className="genre-tag">{g}</span>))}
                </div>
                <div className="movie-card-meta">
                  {movie.rating !== null && <span className="movie-card-rating">⭐ {movie.rating.toFixed(1)}</span>}
                  {movie.year && <span className="movie-card-year">{movie.year}</span>}
                  {hasDuplicates && <span className="duplicate-tag">DUPLICATE</span>}
                  <span className="movie-card-id mono">{movie.id.slice(0, 8)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

