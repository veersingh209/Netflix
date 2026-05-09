import { useEffect, useState, useMemo } from "react";
import type { MovieResponse } from "../../../types";
import { Modal } from "../../ui/Modal";
import api from "../../../apiClient";
import { useCopyApi } from "../../../hooks/useCopyApi";
import { LoadingSpinner } from "../../ui/LoadingSpinner";

const ENRICHMENT_MESSAGES = [
  "Tapping into global cinema databases...",
  "Connecting to external metadata sources...",
  "Fetching cinematic insights from around the world...",
  "Enriching with global film database wisdom...",
  "Exploring international movie archives...",
  "Gathering cinematic intelligence from external sources...",
  "Retrieving deep metadata from global repositories...",
  "Connecting to the worldwide film knowledge network...",
];

interface MovieDetailModalProps {
  movie: MovieResponse | null;
  isOpen: boolean;
  onClose: () => void;
  aiProvider?: string;
  newMovieIds?: Set<string>;
  allMovies?: MovieResponse[];
  health: { ai_gateway?: { api_key_configured?: boolean; circuit_open?: boolean }; external_services?: { tmdb_configured?: boolean; omdb_configured?: boolean } } | null;
}

export function MovieDetailModal({ movie: initialMovie, isOpen, onClose, aiProvider, health, newMovieIds = new Set(), allMovies = [] }: MovieDetailModalProps) {
  const [movie, setMovie] = useState<MovieResponse | null>(initialMovie);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState<string | null>(null);
  const { copyFeedback: enrichCopyFeedback, copyApiLink: copyEnrichEndpoint } = useCopyApi();
  const { copyFeedback: movieCopyFeedback, copyApiLink: copyMovieEndpoint } = useCopyApi();
  const [enrichmentMessageIndex, setEnrichmentMessageIndex] = useState(0);

  // Calculate badge information
  const badgeInfo = useMemo(() => {
    if (!movie) return { isNew: false, duplicateCount: 0 };
    
    const isNew = newMovieIds.has(movie.id);
    
    // Count duplicate titles
    const titleCounts = new Map<string, number>();
    allMovies.forEach(m => {
      const normalizedTitle = m.title.toLowerCase().trim();
      titleCounts.set(normalizedTitle, (titleCounts.get(normalizedTitle) || 0) + 1);
    });
    
    const normalizedTitle = movie.title.toLowerCase().trim();
    const duplicateCount = titleCounts.get(normalizedTitle) || 1;
    
    return { isNew, duplicateCount };
  }, [movie, newMovieIds, allMovies]);

  const isAiReady = useMemo(() => {
    return health?.ai_gateway?.api_key_configured && !health?.ai_gateway?.circuit_open;
  }, [health]);

  useEffect(() => {
    // Use setTimeout to avoid calling setState synchronously in effect
    setTimeout(() => {
      setMovie(initialMovie);
      setEnrichmentError(null);
    }, 0);
    
    if (isOpen && initialMovie && !initialMovie.external_data) {
      if (!isAiReady) {
        setTimeout(() => {
          setEnrichmentError("AI Connection pending. Deep insights are locked until a connection is established.");
        }, 0);
        return;
      }

      const fetchEnrichment = async () => {
        setIsEnriching(true);
        setEnrichmentError(null);
        try {
          const enriched = await api.enrichMovie(initialMovie.id, aiProvider);
          setMovie(enriched);
        } catch {
          setEnrichmentError("AI enrichment service is currently unavailable.");
        } finally {
          setIsEnriching(false);
        }
      };
      fetchEnrichment();
    }
  }, [isOpen, initialMovie, isAiReady, aiProvider]);

  // Cycle enrichment messages while enriching
  useEffect(() => {
    if (!isEnriching) return;
    const timer = setInterval(() => {
      setEnrichmentMessageIndex((prev) => (prev + 1) % ENRICHMENT_MESSAGES.length);
    }, 3000); // Change every 3 seconds
    return () => clearInterval(timer);
  }, [isEnriching]);

  const handleCopyApiLink = () => {
    if (!movie) return;
    copyEnrichEndpoint(`/api/movies/${movie.id}/enrich`);
  };

  const handleRefresh = async () => {
    if (!initialMovie) return;
    setIsEnriching(true);
    setEnrichmentError(null);
    try {
      // Force enrichment to bypass any cached results in the backend
      const enriched = await api.enrichMovie(initialMovie.id, aiProvider, true);
      setMovie(enriched);
    } catch {
      setEnrichmentError("Failed to refresh cinematic insights.");
    } finally {
      setIsEnriching(false);
    }
  };

  const handleCopyMovieApiLink = () => {
    if (!movie) return;
    copyMovieEndpoint(`/api/movies/${movie.id}`);
  };

  if (!movie) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <span><span>🎬</span> Movie Details</span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {badgeInfo.isNew && (
            <span className="new-badge" style={{ marginLeft: "0.5rem" }}>NEW</span>
          )}
          {badgeInfo.duplicateCount > 1 && (
            <span className="duplicate-badge" style={{ marginLeft: "0.5rem" }}>×{badgeInfo.duplicateCount}</span>
          )}
          <button 
            className="copy-api-link-btn" 
            onClick={handleCopyMovieApiLink}
            title="Copy the movie details API endpoint"
            style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", marginLeft: badgeInfo.isNew || badgeInfo.duplicateCount > 1 ? "0.5rem" : "1rem" }}
          >
            {movieCopyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
          </button>
        </div>
      </div>
    }
      id={`movie-detail-${movie.id.slice(0,8)}`}
    >
      <div className="movie-detail-content">
        <div className="movie-detail-main">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
            <h3 className="movie-detail-title" style={{ margin: "0", fontSize: "1.75rem", flex: "1" }}>{movie.title}</h3>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", minWidth: "0" }}>
              {movie.year && <span className="meta-pill" style={{ fontSize: "0.75rem" }}>📆 {movie.year}</span>}
              {movie.rating !== null && <span className="meta-pill" style={{ fontSize: "0.75rem" }}>⭐ {movie.rating.toFixed(1)}</span>}
              {movie.genre.map((g) => (
                <span key={g} className="genre-tag" style={{ fontSize: "0.7rem" }}>{g}</span>
              ))}
            </div>
          </div>
        </div>

        {/* ─── External Enrichment Section ───────────────── */}
        <div className="enrichment-section glass-card" style={{ 
          marginTop: "1rem", 
          marginBottom: "1.5rem", 
          padding: "1.25rem",
          background: "rgba(139, 92, 246, 0.05)",
          border: "1px solid rgba(139, 92, 246, 0.2)"
        }}>
          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h4 style={{ fontSize: "1rem", color: "var(--accent-purple)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                ✨ AI Insights
              </h4>
              {isAiReady && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={handleRefresh}
                    disabled={isEnriching}
                    className="copy-api-link-btn"
                    title="Refresh cinematic insights and poster"
                    style={{ 
                      padding: "0.25rem 0.5rem", 
                      fontSize: "0.75rem", 
                      background: isEnriching ? "rgba(30, 41, 59, 0.4)" : "rgba(30, 41, 59, 0.8)", 
                      borderColor: isEnriching ? "rgba(59, 130, 246, 0.15)" : "rgba(59, 130, 246, 0.35)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: "32px",
                      height: "26px",
                      cursor: isEnriching ? "not-allowed" : "pointer",
                      opacity: isEnriching ? 0.6 : 1
                    }}
                  >
                    {isEnriching ? (
                      <LoadingSpinner size="sm" variant="spinner" color="white" />
                    ) : (
                      <span>🔄</span>
                    )}
                  </button>
                  <button
                    className="copy-api-link-btn"
                    onClick={handleCopyApiLink}
                    title="Copy the external enrichment API endpoint"
                    style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", background: "rgba(30, 41, 59, 0.8)", borderColor: "rgba(59, 130, 246, 0.35)", height: "26px" }}
                  >
                    {enrichCopyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
                  </button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", opacity: isAiReady ? 1 : 0.2, pointerEvents: isAiReady ? "auto" : "none" }}>
              <a 
                href={movie.external_data?.tmdb_url || `https://www.themoviedb.org/search?query=${encodeURIComponent(movie.title)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="copy-api-link-btn"
                style={{ textDecoration: "none", background: "rgba(59, 130, 246, 0.15)", color: "var(--accent-blue)" }}
              >
                TMDB
              </a>
              <a 
                  href={movie.external_data?.imdb_url || `https://www.imdb.com/find?q=${encodeURIComponent(movie.title + (movie.year ? ` ${movie.year}` : ''))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="copy-api-link-btn"
                  style={{ textDecoration: "none", background: "rgba(255, 193, 7, 0.15)", color: "#FFC107" }}
                >
                  IMDB
                </a>
              <a 
                href={movie.external_data?.rotten_tomatoes_url || `https://www.rottentomatoes.com/search?search=${encodeURIComponent(movie.title + (movie.year ? ` ${movie.year}` : ''))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="copy-api-link-btn"
                style={{ textDecoration: "none", background: "rgba(255, 69, 0, 0.15)", color: "#FF4500" }}
              >
                Rotten Tomatoes
              </a>
              <a 
                href={movie.external_data?.letterboxd_url || `https://letterboxd.com/search/films/${encodeURIComponent(movie.title + (movie.year ? ` ${movie.year}` : ''))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="copy-api-link-btn"
                style={{ textDecoration: "none", background: "rgba(0, 123, 255, 0.15)", color: "#007BFF" }}
              >
                Letterboxd
              </a>
            </div>
          </div>
          <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontStyle: "italic", marginBottom: "0.75rem" }}>
            <div>Source: {movie.external_data?.provider || (isEnriching ? "Analyzing..." : "Global Database")}</div>
            {movie.external_data?.popularity && (
              <div style={{ marginTop: "0.5rem" }}>
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "0.25rem 0.5rem",
                  background: "rgba(139, 92, 246, 0.15)",
                  border: "1px solid rgba(139, 92, 246, 0.3)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.7rem",
                  fontWeight: 600,
                  color: "var(--accent-purple)",
                  fontStyle: "normal"
                }}>
                  Popularity Score: {Math.round(movie.external_data.popularity)}
                </span>
              </div>
            )}
          </div>

          <div style={{ 
            minHeight: "120px", // Ensure consistent height to prevent layout shift
            position: "relative"
          }}>
            {isEnriching ? (
              <div className="enrichment-loading" style={{ 
                padding: "1.5rem 1rem", 
                color: "var(--text-muted)", 
                fontSize: "0.9rem", 
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "120px"
              }}>
                <LoadingSpinner size="md" message={ENRICHMENT_MESSAGES[enrichmentMessageIndex]} variant="dots" />
                <div style={{ fontSize: "0.8rem", fontStyle: "italic", opacity: 0.8, marginTop: "0.75rem" }}>
                  Enriching with external metadata sources...
                </div>
              </div>
            ) : movie.external_data ? (
              <div className="enrichment-body">
                {/* Poster Image */}
                {movie.external_data.poster_url ? (
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "center", 
                    marginBottom: "1rem" 
                  }}>
                    <img 
                      src={movie.external_data.poster_url} 
                      alt={`${movie.title} poster`}
                      style={{
                        maxWidth: "200px",
                        maxHeight: "300px",
                        borderRadius: "var(--radius-md)",
                        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                        objectFit: "cover"
                      }}
                      onError={(e) => {
                        // Hide image if it fails to load and show fallback
                        const img = e.target as HTMLImageElement;
                        const container = img.parentElement;
                        if (container) {
                          const fallbackDiv = document.createElement('div');
                          fallbackDiv.style.cssText = `
                            width: 200px;
                            height: 300px;
                            border-radius: var(--radius-md);
                            background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%);
                            border: 2px dashed rgba(139, 92, 246, 0.3);
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            color: var(--text-muted);
                            font-size: 0.9rem;
                            text-align: center;
                            padding: 1rem;
                          `;
                          fallbackDiv.innerHTML = `
                            <div style="font-size: 3rem; margin-bottom: 0.5rem;">🎬</div>
                            <div style="font-weight: 600; margin-bottom: 0.25rem;">Poster Unavailable</div>
                            <div style="font-size: 0.8rem; opacity: 0.8;">Image search failed</div>
                          `;
                          container.replaceChild(fallbackDiv, img);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "center", 
                    marginBottom: "1rem" 
                  }}>
                    <div style={{
                      width: "200px",
                      height: "300px",
                      borderRadius: "var(--radius-md)",
                      background: "linear-gradient(135deg, rgba(139, 92, 246, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)",
                      border: "2px dashed rgba(139, 92, 246, 0.2)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--text-muted)",
                      fontSize: "0.9rem",
                      textAlign: "center",
                      padding: "1.5rem",
                      position: "relative",
                      overflow: "hidden"
                    }}>
                      <div style={{fontSize: "2.5rem", marginBottom: "0.75rem", opacity: 0.6}}>🎞️</div>
                      
                      {(!health?.external_services?.tmdb_configured && !health?.external_services?.omdb_configured) ? (
                        <>
                          <div style={{fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em"}}>
                            Keys Required
                          </div>
                          <div style={{fontSize: "0.75rem", opacity: 0.8, lineHeight: "1.4"}}>
                            TMDB or OMDb API keys must be configured in 
                            <button 
                              onClick={(e) => { e.preventDefault(); (window as { openDiagnostics?: () => void }).openDiagnostics?.(); }}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--accent-primary)",
                                textDecoration: "underline",
                                padding: "0 4px",
                                cursor: "pointer",
                                fontSize: "inherit",
                                fontWeight: 600
                              }}
                            >
                              Diagnostics
                            </button>
                            to enable posters.
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{fontWeight: 600, color: "var(--text-primary)", marginBottom: "0.25rem"}}>No Poster Found</div>
                          <div style={{fontSize: "0.8rem", opacity: 0.7}}>Not found in active databases</div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {movie.external_data.tagline && (
                  <p style={{ fontStyle: "italic", color: "var(--text-primary)", marginBottom: "0.75rem", fontSize: "1rem" }}>
                    "{movie.external_data.tagline}"
                  </p>
                )}
                <p style={{ fontSize: "0.9rem", lineHeight: "1.5", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  {movie.external_data.overview}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "1rem", fontSize: "0.85rem" }}>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Director</span>
                    <span style={{ fontWeight: 600 }}>{movie.external_data.director}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-muted)", display: "block", marginBottom: "0.25rem" }}>Top Cast</span>
                    <span style={{ fontWeight: 600 }}>{movie.external_data.cast.join(", ")}</span>
                  </div>
                </div>
              </div>
            ) : enrichmentError ? (
              <div style={{ 
                color: "var(--text-muted)", 
                fontSize: "0.85rem", 
                padding: "1.5rem 1rem",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "120px",
                gap: "12px"
              }}>
                <p>{enrichmentError}</p>
                {!health?.ai_gateway?.api_key_configured && (
                  <button 
                    className="copy-api-link-btn" 
                    onClick={() => (window as { openDiagnostics?: () => void }).openDiagnostics?.()}
                    style={{ background: "rgba(139, 92, 246, 0.2)", color: "var(--accent-purple)", borderColor: "rgba(139, 92, 246, 0.4)" }}
                  >
                    Open Diagnostics
                  </button>
                )}
              </div>
            ) : (
              <div style={{ 
                color: "var(--text-muted)", 
                fontSize: "0.85rem", 
                padding: "1.5rem 1rem",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "120px"
              }}>
                Deep metadata is currently unavailable for this title.
              </div>
            )}
          </div>
          
          {/* Netflix Button at Bottom */}
          <div style={{ 
            marginTop: "1rem", 
            paddingTop: "1rem", 
            borderTop: "1px solid rgba(139, 92, 246, 0.2)",
            opacity: isAiReady ? 1 : 0.2,
            pointerEvents: isAiReady ? "auto" : "none"
          }}>
            <a 
              href={`https://www.netflix.com/search?q=${encodeURIComponent(movie.title + (movie.year ? ` ${movie.year}` : ''))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="copy-api-link-btn"
              style={{ 
                textDecoration: "none", 
                background: "linear-gradient(135deg, rgba(229, 9, 20, 0.15) 0%, rgba(229, 9, 20, 0.25) 100%)", 
                color: "var(--red-light)", 
                borderColor: "rgba(229, 9, 20, 0.3)",
                padding: "0.75rem 1.5rem",
                fontSize: "1rem",
                fontWeight: "600",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                transition: "all 0.3s ease",
                transform: "scale(1)",
                boxShadow: "0 2px 8px rgba(229, 9, 20, 0.2)",
                position: "relative",
                overflow: "hidden"
              }}
              onMouseEnter={(e) => {
                if (!isAiReady) return;
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.background = "linear-gradient(135deg, rgba(229, 9, 20, 0.25) 0%, rgba(229, 9, 20, 0.35) 100%)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(229, 9, 20, 0.3)";
              }}
              onMouseLeave={(e) => {
                if (!isAiReady) return;
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.background = "linear-gradient(135deg, rgba(229, 9, 20, 0.15) 0%, rgba(229, 9, 20, 0.25) 100%)";
                e.currentTarget.style.boxShadow = "0 2px 8px rgba(229, 9, 20, 0.2)";
              }}
            >
              <span style={{ 
                fontSize: "1.2rem",
                display: "inline-block",
                animation: isAiReady ? "pulse 2s infinite" : "none"
              }}>🎬</span>
              {isAiReady ? "Watch on Netflix" : "Connection Required"}
            </a>
          </div>
        </div>

        <div className="movie-detail-technical" style={{ marginBottom: "1.5rem", opacity: 0.6 }}>
          <h4 style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginBottom: "0.5rem", textTransform: "uppercase" }}>System Trace</h4>
          <div className="mono" style={{ background: "rgba(0,0,0,0.2)", padding: "0.5rem", borderRadius: "4px", fontSize: "0.75rem", wordBreak: "break-all" }}>
            FID: {movie.id}
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: "2rem", display: "grid", gridTemplateColumns: movie.drive_url ? "1fr 1fr" : "1fr", gap: "12px" }}>
          {movie.drive_url && (
            <a 
              href={movie.drive_url}
              target="_blank"
              rel="noopener noreferrer"
              className="form-cancel-btn"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", gap: "8px" }}
            >
              <span style={{ fontSize: "1.1rem" }}>📂</span> Source File
            </a>
          )}
          <button 
            className="form-submit-btn" 
            onClick={onClose}
            style={{ width: "100%", justifyContent: "center" }}
          >
            Close Details
          </button>
        </div>
      </div>
    </Modal>
  );
}
