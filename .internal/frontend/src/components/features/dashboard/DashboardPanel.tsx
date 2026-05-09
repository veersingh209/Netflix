/**
 * DashboardPanel — Displays aggregated library statistics.
 *
 * Shows Total Movies, Average Rating, Top 5 Genres (bar chart),
 * and Top Rated Movies. Data sourced from /api/stats.
 */

import { useState, useEffect, useMemo } from "react";
import "../../ui/Dashboard.css";
import { GlassCard } from "../../ui/GlassCard";
import { useSorting } from "../../../hooks/useSorting";
import { SortControls } from "../../ui/SortControls";
import { useNetflix } from "../../../hooks/useNetflixStore";

interface DashboardPanelProps {
  onDashboardClick: (type: "genre" | "year" | "all" | "rated" | "unique_genres", value?: string | number) => void;
}

export function DashboardPanel({
  onDashboardClick,
}: DashboardPanelProps) {
  const {
    stats,
    isLoading,
    setSelectedMovie,
    newMovieIds,
    addedMovies
  } = useNetflix();

  const onMovieClick = setSelectedMovie;

  const [topRatedCount, setTopRatedCount] = useState("5");
  const [genreCount, setGenreCount] = useState("5");

  // 1. Movie Sorting
  const {
    sortKey: movieSortKey,
    sortOrder: movieSortOrder,
    isSorting: isMovieSorting,
    sortedItems: sortedTopRated,
    toggleSort: toggleMovieSort
  } = useSorting(stats?.top_rated_movies ?? [], { defaultSortKey: "rating" });

  // 2. Genre Sorting
  const {
    sortKey: genreSortKey,
    sortOrder: genreSortOrder,
    isSorting: isGenreSorting,
    sortedItems: sortedTopGenres,
    toggleSort: toggleGenreSort
  } = useSorting(stats?.top_genres ?? [], { defaultSortKey: "count" });

  // 3. Year Sorting
  const {
    sortKey: yearSortKey,
    sortOrder: yearSortOrder,
    isSorting: isYearSorting,
    sortedItems: sortedYearDistributionEntries,
    toggleSort: toggleYearSort
  } = useSorting(
    Object.entries(stats?.year_distribution ?? {}).map(([year, count]) => ({ year, count })),
    { defaultSortKey: "count" }
  );

  // Calculate new movie counts for each stat card
  const newMovieCounts = useMemo(() => {
    if (addedMovies.length === 0 || newMovieIds.size === 0) {
      return { totalMovies: 0, ratedMovies: 0, uniqueGenres: 0, avgRating: 0 };
    }

    const newMovies = addedMovies;
    const newRatedMovies = newMovies.filter(movie => movie.rating && movie.rating > 0);
    const newGenres = new Set(newMovies.map(movie => movie.genre || '').flat().filter(Boolean));

    return {
      totalMovies: newMovies.length,
      ratedMovies: newRatedMovies.length,
      uniqueGenres: newGenres.size,
      avgRating: newRatedMovies.length > 0
        ? newRatedMovies.reduce((sum, movie) => sum + (movie.rating || 0), 0) / newRatedMovies.length
        : 0,
    };
  }, [addedMovies, newMovieIds]);

  // Decade Grouping for years
  const decadeGroups = useMemo(() => {
    const groups: Record<string, { year: string, count: number }[]> = {};
    sortedYearDistributionEntries.forEach((entry) => {
      if (entry.count === 0) return;
      const decade = `${Math.floor(Number(entry.year) / 10) * 10}s`.toLowerCase();
      if (!groups[decade]) groups[decade] = [];
      groups[decade].push(entry);
    });
    return groups;
  }, [sortedYearDistributionEntries]);

  // Sync counts to available data
  useEffect(() => {
    if (genreCount !== "all" && Number(genreCount) > sortedTopGenres.length && sortedTopGenres.length > 0) {
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => setGenreCount("all"), 0);
    }
  }, [sortedTopGenres.length, genreCount]);

  useEffect(() => {
    if (topRatedCount !== "all" && Number(topRatedCount) > sortedTopRated.length && sortedTopRated.length > 0) {
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => setTopRatedCount("all"), 0);
    }
  }, [sortedTopRated.length, topRatedCount]);

  if (isLoading && !stats) {
    return (
      <div className="dashboard-panel glass-card animate-fade-in">
        <div className="dashboard-loading">
          <div className="spinner spinner-sm" />
          <span>Loading statistics...</span>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const maxGenreCount = sortedTopGenres.length > 0
    ? Math.max(...sortedTopGenres.map((g) => g.count))
    : 1;
  const maxYearCount = sortedYearDistributionEntries.length > 0
    ? Math.max(...sortedYearDistributionEntries.map((e) => e.count))
    : 1;

  // Count duplicate titles in top rated for visual indication
  const titleCounts = new Map<string, number>();
  (stats?.top_rated_movies ?? []).forEach((movie) => {
    const normalizedTitle = movie.title.toLowerCase().trim();
    titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) || 0) + 1);
  });

  return (
    <section className="dashboard-panel animate-fade-in-up" id="dashboard-panel">
      <h2 className="section-title">
        <span className="section-icon">📊</span>
        Library Dashboard
      </h2>

      {/* ─── Stat Cards ──────────────────────────────── */}
      <div className="stat-cards stagger-children">
        <GlassCard
          className="stat-card interactive"
          onClick={() => onDashboardClick("all")}
          title="Click to view all movies"
        >
          {newMovieCounts.totalMovies > 0 && (
            <div className="stat-card-badge">+{newMovieCounts.totalMovies}</div>
          )}
          <div className="stat-card-icon red">🎬</div>
          <div className="stat-card-value">{stats.total_movies.toLocaleString()}</div>
          <div className="stat-card-label">Total Movies</div>
        </GlassCard>

        <GlassCard
          className="stat-card interactive"
          onClick={() => onDashboardClick("rated")}
          title="Click to view rated movies"
        >
          {newMovieCounts.avgRating > 0 && (
            <div className="stat-card-badge">+{newMovieCounts.ratedMovies}</div>
          )}
          <div className="stat-card-icon amber">⭐</div>
          <div className="stat-card-value">{stats.average_rating.toFixed(1)}</div>
          <div className="stat-card-label">Avg Rating</div>
        </GlassCard>

        <GlassCard
          className="stat-card interactive"
          onClick={() => onDashboardClick("unique_genres")}
          title="Click to view all genres"
        >
          {newMovieCounts.uniqueGenres > 0 && (
            <div className="stat-card-badge">+{newMovieCounts.uniqueGenres}</div>
          )}
          <div className="stat-card-icon blue">🎭</div>
          <div className="stat-card-value">{stats.total_genres}</div>
          <div className="stat-card-label">Unique Genres</div>
        </GlassCard>

        <GlassCard
          className="stat-card interactive"
          onClick={() => onDashboardClick("rated")}
          title="Click to view rated movies"
        >
          {newMovieCounts.ratedMovies > 0 && (
            <div className="stat-card-badge">+{newMovieCounts.ratedMovies}</div>
          )}
          <div className="stat-card-icon emerald">✓</div>
          <div className="stat-card-value">{stats.rated_count.toLocaleString()}</div>
          <div className="stat-card-label">Rated Movies</div>
        </GlassCard>
      </div>

      {/* ─── Top Genres & Top Rated Row ───────────────── */}
      <div className="dashboard-row">
        <div className="glass-card dashboard-section">
          <div className="dashboard-section-title-row">
            <h3 className="dashboard-section-title">
              <span>🏆</span> Genres
            </h3>
            <div className="dashboard-controls-row">
              <SortControls
                sortKey={genreSortKey}
                sortOrder={genreSortOrder}
                onSortChange={toggleGenreSort}
                availableSorts={['count', 'name']}
                isSorting={isGenreSorting}
              />
              <div className="dashboard-count-controls">
                <span className="sort-label">Show:</span>
                <select
                  className="count-select"
                  value={genreCount}
                  onChange={(e) => setGenreCount(e.target.value)}
                >
                  {sortedTopGenres.length >= 5 && <option value="5">5</option>}
                  {sortedTopGenres.length >= 10 && <option value="10">10</option>}
                  {sortedTopGenres.length >= 15 && <option value="15">15</option>}
                  <option value="all">All ({sortedTopGenres.length})</option>
                </select>
              </div>
            </div>
          </div>
          <div className="genre-bars">
            {sortedTopGenres.slice(0, genreCount === "all" ? sortedTopGenres.length : Number(genreCount)).map((g, idx) => (
              <GlassCard
                key={g.genre}
                className="genre-bar-row-wrapper"
                onClick={() => onDashboardClick("genre", g.genre)}
                title={`Click to view ${g.genre} movies`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <div className="genre-bar-row">
                  <div className="genre-bar-rank">{idx + 1}</div>
                  <div className="genre-bar-name">{g.genre}</div>
                  <div className="genre-bar-track">
                    <div
                      className="genre-bar-fill"
                      style={{
                        width: `${(g.count / maxGenreCount) * 100}%`,
                        animationDelay: `${idx * 100}ms`,
                      }}
                    />
                  </div>
                  <div className="genre-bar-count">{g.count}</div>
                </div>
              </GlassCard>
            ))}
            {sortedTopGenres.length === 0 && (
              <div className="empty-state-text">No genre data available</div>
            )}
          </div>
        </div>

        <div className="glass-card dashboard-section">
          <div className="dashboard-section-title-row">
            <h3 className="dashboard-section-title">
              <span>🌟</span> Ratings
            </h3>
            <div className="dashboard-controls-row">
              <SortControls
                sortKey={movieSortKey}
                sortOrder={movieSortOrder}
                onSortChange={toggleMovieSort}
                availableSorts={['rating', 'title', 'year']}
                isSorting={isMovieSorting}
              />
              <div className="dashboard-count-controls">
                <span className="sort-label">Show:</span>
                <select
                  className="count-select"
                  value={topRatedCount}
                  onChange={(e) => setTopRatedCount(e.target.value)}
                >
                  {sortedTopRated.length >= 5 && <option value="5">5</option>}
                  {sortedTopRated.length >= 10 && <option value="10">10</option>}
                  {sortedTopRated.length >= 15 && <option value="15">15</option>}
                  <option value="all">All ({sortedTopRated.length})</option>
                </select>
              </div>
            </div>
          </div>
          <div className="top-rated-list">
            {sortedTopRated.slice(0, topRatedCount === "all" ? sortedTopRated.length : Number(topRatedCount)).map((movie, idx) => {
              const normalizedTitle = movie.title.toLowerCase().trim();
              const duplicateCount = titleCounts.get(normalizedTitle) || 1;
              const hasDuplicates = duplicateCount > 1;
              const isNew = newMovieIds.has(movie.id);

              return (
                <div
                  key={movie.id}
                  className={`top-rated-item${hasDuplicates ? " has-duplicate" : ""}${isNew ? " is-new" : ""} ${isMovieSorting ? `sort-animation sort-animation-stagger-${idx + 1}` : ''}`}
                  onClick={() => onMovieClick(movie)}
                  style={{ cursor: "pointer", transition: "transform 0.2s" }}
                  title={hasDuplicates ? `${duplicateCount} copies in library` : isNew ? "Just added!" : undefined}
                >
                  <div className="top-rated-rank">#{idx + 1}</div>
                  <div className="top-rated-info">
                    <div className="top-rated-title">{movie.title}</div>
                    <div className="top-rated-rating">⭐ {movie.rating?.toFixed(1) ?? "N/A"}</div>
                  </div>
                  <div className="top-rated-badges">
                    {isNew && <span className="new-badge">NEW</span>}
                    {hasDuplicates && <span className="duplicate-badge">×{duplicateCount}</span>}
                  </div>
                </div>
              );
            })}
            {sortedTopRated.length === 0 && (
              <div className="empty-state-text">No rated movies available</div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Year Distribution (Decade Grouped) ────────── */}
      <div className="glass-card dashboard-section dashboard-section-full" style={{ marginTop: "var(--space-lg)" }}>
        <div className="dashboard-section-title-row">
          <h3 className="dashboard-section-title">
            <span>📆</span> Year Distribution
          </h3>
          <SortControls
            sortKey={yearSortKey}
            sortOrder={yearSortOrder}
            onSortChange={toggleYearSort}
            availableSorts={['count', 'year']}
            isSorting={isYearSorting}
          />
        </div>
        <div className="year-distribution-container">
          {Object.entries(decadeGroups).sort((a, b) => b[0].localeCompare(a[0])).map(([decade, entries]) => (
            <div key={decade} className="decade-group">
              <div className="decade-label">{decade}</div>
              <div className="year-bars-grid">
                {entries.map((entry, idx) => {
                  return (
                    <GlassCard
                      key={entry.year}
                      className="year-bar-wrapper"
                      onClick={() => onDashboardClick("year", Number(entry.year))}
                      title={`Click to view movies from ${entry.year}`}
                      style={{ animationDelay: `${idx * 50}ms` }}
                    >
                      <div className="year-bar-row">
                        <div className="year-bar-label">{entry.year}</div>
                        <div className="year-bar-track">
                          <div
                            className="year-bar-fill"
                            style={{
                              width: `${(entry.count / maxYearCount) * 100}%`,
                              animationDelay: `${idx * 100}ms`,
                            }}
                          />
                        </div>
                        <div className="year-bar-count">{entry.count}</div>
                      </div>
                    </GlassCard>
                  );
                })}
              </div>
            </div>
          ))}
          {sortedYearDistributionEntries.length === 0 && (
            <div className="empty-state-text">No year distribution available</div>
          )}
        </div>
      </div>
    </section>
  );
}
