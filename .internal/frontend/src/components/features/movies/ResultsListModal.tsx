import { useMemo, useEffect } from "react";
import type { MovieResponse } from "../../../types";
import { Modal } from "../../ui/Modal";
import { useCopyApi } from "../../../hooks/useCopyApi";
import { SortControls } from "../../ui/SortControls";
import { LoadingSpinner } from "../../ui/LoadingSpinner";
import { useSorting, type SortKey } from "../../../hooks/useSorting";

interface ResultsListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  movies: MovieResponse[];
  isLoading: boolean;
  onMovieClick: (movie: MovieResponse) => void;
  genres?: string[];
  genreCounts?: { genre: string; count: number }[];
  onGenreClick?: (genre: string) => void;
  newMovieIds?: Set<string>;
  allMovies?: MovieResponse[];
}


export function ResultsListModal({
  isOpen,
  onClose,
  title,
  description,
  movies,
  isLoading,
  onMovieClick,
  genres,
  genreCounts,
  onGenreClick,
  newMovieIds = new Set(),
  allMovies = [],
}: ResultsListModalProps) {
  const { copyFeedback, copyApiLink } = useCopyApi();
  
  // 1. Unified Sorting Hook
  const {
    sortKey,
    sortOrder,
    isSorting,
    sortedItems: sortedMovies,
    toggleSort,
    setSortKey,
    setSortOrder
  } = useSorting(movies, { defaultSortKey: "rating" });

  const isYearSortMeaningful = useMemo(() => {
    if (movies.length <= 1) return false;
    const firstYear = movies[0].year;
    return movies.some(m => m.year !== firstYear);
  }, [movies]);

  useEffect(() => {
    if (isOpen && sortKey === "year" && !isYearSortMeaningful) {
      setSortKey("rating");
    }
  }, [isOpen, isYearSortMeaningful, sortKey, setSortKey]);

  // Set appropriate default sort key when switching between movies and genres
  useEffect(() => {
    if (genres && genres.length > 0) {
      if (sortKey === "rating" || sortKey === "year") {
        setSortKey("name");
        setSortOrder("asc");
      }
    } else {
      if (sortKey === "name" || sortKey === "count") {
        setSortKey("rating");
        setSortOrder("desc");
      }
    }
  }, [genres, sortKey, setSortKey, setSortOrder]);

  const sortedGenres = useMemo(() => {
    if (!genres) return [];
    const countMap = new Map<string, number>();
    if (genreCounts) {
      genreCounts.forEach(({ genre, count }) => countMap.set(genre, count));
    }
    
    return [...genres].sort((a, b) => {
      if (sortKey === "name") {
        const strA = a.toLowerCase();
        const strB = b.toLowerCase();
        if (strA < strB) return sortOrder === "asc" ? -1 : 1;
        if (strA > strB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      }
      
      if (sortKey === "count") {
        const countA = countMap.get(a) || 0;
        const countB = countMap.get(b) || 0;
        if (countA < countB) return sortOrder === "asc" ? -1 : 1;
        if (countA > countB) return sortOrder === "asc" ? 1 : -1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      }
      
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });
  }, [genres, genreCounts, sortKey, sortOrder]);

  const handleCopyApiLink = () => {
    let endpoint: string;
    
    // Construct API endpoint based on the modal content type
    if (genres && genres.length > 0) {
      // Genres modal - copy the genres endpoint
      endpoint = `/api/genres`;
    } else if (title.includes("All Movies")) {
      // Total Movies modal
      endpoint = `/api/movies`;
    } else if (title.includes("Rated Movies")) {
      // Rated Movies modal
      endpoint = `/api/movies?min_rating=0.1`;
    } else if (title.includes("Movies from")) {
      // Year Distribution modal - extract year from title
      const yearMatch = title.match(/Movies from (\d{4})/);
      if (yearMatch) {
        endpoint = `/api/movies?year=${yearMatch[1]}`;
      } else {
        endpoint = `/api/movies`;
      }
    } else if (title.includes("Movies") && description.includes("genre")) {
      // Specific genre modal - extract genre from title
      const genreMatch = title.match(/^(.+) Movies$/);
      if (genreMatch) {
        const genre = genreMatch[1];
        endpoint = `/api/movies?genres=${encodeURIComponent(genre)}`;
      } else {
        endpoint = `/api/movies`;
      }
    } else {
      // Default to movies endpoint
      endpoint = `/api/movies`;
    }
    
    copyApiLink(endpoint);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <span>{title}</span>
        <button 
          className="copy-api-link-btn" 
          onClick={handleCopyApiLink}
          title="Copy the API endpoint for this data"
          style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem", marginLeft: "1rem" }}
        >
          {copyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
        </button>
      </div>
    }>
      <div className="results-modal-content">
        <p className="results-modal-description">{description}</p>

        {isLoading ? (
          <div className="results-modal-loading">
            <LoadingSpinner size="md" message="Loading Results..." />
          </div>
        ) : (
          <div className="results-modal-body">
            <div className="results-modal-header-row">
              <div className="results-count-badge">
                {genres && genres.length > 0 ? `${genres.length} Genres` : `${movies.length} Results Found`}
              </div>

              {((!genres && movies.length > 0) || (genres && genres.length > 0)) && (
                <SortControls
                  sortKey={sortKey}
                  sortOrder={sortOrder}
                  onSortChange={toggleSort}
                  isSorting={isSorting}
                  availableSorts={genres && genres.length > 0 ? ['name', 'count'] as SortKey[] : 
                    isYearSortMeaningful ? ['rating', 'year', 'title'] as SortKey[] : ['rating', 'title'] as SortKey[]}
                />
              )}
            </div>

            {genres && genres.length > 0 ? (
              <div className="genres-grid">
                {sortedGenres.map((genre) => (
                  <button
                    key={genre}
                    className="genre-pill-btn"
                    onClick={() => onGenreClick?.(genre)}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            ) : genres && genres.length === 0 ? (
              <div className="empty-results">
                <div className="empty-results-icon">📂</div>
                <div className="empty-results-text">No genres found</div>
                <div className="empty-results-sub">The library seems to be missing category metadata.</div>
              </div>
            ) : (
              <div className="results-grid-mini">
                 {sortedMovies.map((movie: MovieResponse, idx: number) => {
                  const isNew = newMovieIds.has(movie.id);
                  const normalizedTitle = movie.title.toLowerCase().trim();
                  const duplicateCount = allMovies.filter(m => m.title.toLowerCase().trim() === normalizedTitle).length;
                  
                  return (
                    <div
                      key={movie.id}
                      className={`result-item-mini glass-card ${isSorting ? `sort-animation sort-animation-stagger-${Math.min(idx + 1, 5)}` : ''}`}
                      onClick={() => onMovieClick(movie)}
                    >
                    <div className="result-item-header">
                      <div className="result-item-title">
                        {movie.title}
                      </div>
                      <div className="result-item-badges">
                        {isNew && <span className="new-badge">NEW</span>}
                        {duplicateCount > 1 && <span className="duplicate-badge">×{duplicateCount}</span>}
                      </div>
                      <div className="result-item-uuid">{movie.id}</div>
                    </div>
                    <div className="result-item-genres">
                      {(movie.genre || []).map((g: string) => (
                        <span key={g} className="genre-tag-mini">{g}</span>
                      ))}
                    </div>
                    <div className="result-item-meta">
                      <span className="rating-pill">⭐ {movie.rating?.toFixed(1) ?? "N/A"}</span>
                      <span className="year-pill">{movie.year ?? "N/A"}</span>
                    </div>
                    </div>
                  );
                })}
                {movies.length === 0 && (
                  <div className="empty-results">
                    <div className="empty-results-icon">🔍</div>
                    <div className="empty-results-text">No movies found in this category</div>
                    <div className="empty-results-sub">Try adjusting your dashboard filters or checking back later.</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
