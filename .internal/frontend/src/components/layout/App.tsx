import { useState, useCallback, useEffect } from "react";
import { useNetflix } from "../../hooks/useNetflixStore";
import { DashboardPanel } from "../features/dashboard/DashboardPanel";
import { SearchInterface } from "../features/search/SearchInterface";
import { FiltersPanel } from "../features/dashboard/FiltersPanel";
import { MovieGrid } from "../features/movies/MovieGrid";
import { AddMovieModal } from "../features/movies/AddMovieModal";
import { MovieDetailModal } from "../features/movies/MovieDetailModal";
import { GlobalLoadingOverlay } from "../ui/GlobalLoadingOverlay";
import { ResultsListModal } from "../features/movies/ResultsListModal";
import { SystemStatusModal } from "../features/system/SystemStatusModal";
import { ShutdownModal } from "../features/system/ShutdownModal";
import { Brand } from "./Brand";
import { StatusIndicator } from "./StatusIndicator";
import { Button } from "../ui/Button";

/**
 * Full Netflix Movie Library Explorer
 *
 * Layout:
 *   Header → Dashboard → Search → Filters → Movie Grid
 *   + Add Movie Modal (FAB trigger)
 */

function App() {
  const {
    movies, stats, aiMetadata, aiProvider, isLoading, error,
    isIngesting, ingestionLogs, user,
    newMovieIds, addedMovies,
    selectedMovie, setSelectedMovie,
    resultsModal, openModal, closeResultsModal,
    systemStatus, openSystemStatusModal, closeSystemStatusModal,
    addMovie, clear,
    setAiProvider, refreshStats, checkIngestionStatus, checkSystemHealth,
    aiProviderOptions, shutdown,
  } = useNetflix();
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeView, setActiveView] = useState<"search" | "filter">("search");
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showShutdownModal, setShowShutdownModal] = useState(false);
  const [showRefreshWarning, setShowRefreshWarning] = useState(false);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isShuttingDown) return;

      // Show warning if user has added movies that will be lost
      if (addedMovies.length > 0) {
        const message = `You have ${addedMovies.length} movie${addedMovies.length !== 1 ? 's' : ''} that will be lost if you refresh. Are you sure you want to continue?`;
        e.preventDefault();
        e.returnValue = message; // Standard for browser to display confirmation

        // Show visual warning overlay
        setShowRefreshWarning(true);
        setTimeout(() => setShowRefreshWarning(false), 3000);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isShuttingDown, addedMovies, showRefreshWarning]);

  useEffect(() => {
    // Initial load: check ingestion status first, then load stats
    // This ensures the loading screen shows until backend is fully ready
    void checkIngestionStatus().then(() => {
      void refreshStats();
    });
  }, [checkIngestionStatus, refreshStats]);



  const resultLabel = activeView === "search"
    ? (aiMetadata ? `AI Search Results (${movies.length})` : "Search Results")
    : "Filter Results";


  const handleClearResults = useCallback(() => {
    clear();
  }, [clear]);

  const handleAddSuccess = useCallback(() => {
    // The store already handles updating newMovieIds and movies array
    // Just refresh stats to update dashboard counts
    refreshStats();
  }, [refreshStats]);

  const handleShutdown = useCallback(async () => {
    setIsShuttingDown(true);
    try {
      await shutdown();
    } catch {
      // Shutdown initiated, connection will drop
    }

    // Fallback: Attempt to close the window from the frontend after a delay
    // This works in tandem with the backend's AppleScript for maximum reliability
    setTimeout(() => {
      try {
        window.open('', '_self', '');
        window.close();
      } catch {
        // Handle window closing errors silently
      }

      // If we're still here, redirect to about:blank so the user doesn't see a "connection refused" error
      setTimeout(() => {
        window.location.href = "about:blank";
      }, 2000);
    }, 4000); // 4.0s timeout (matches the 3.5s UI countdown)
  }, [shutdown]);

  return (
    <>
      <GlobalHooks openDiagnostics={openSystemStatusModal} />
      <GlobalLoadingOverlay
        isIngesting={isIngesting}
        error={error}
        logs={ingestionLogs}
        user={user}
        statsLoaded={!!stats}
        onShutdown={handleShutdown}
        isAppShuttingDown={isShuttingDown}
      />
      <div className="app">
        {/* ─── Header ─────────────────────────────────────── */}
        <header className="app-header">
          <div className="header-content">
            <div className="header-brand-container">
              <Brand />
              <Button
                variant="primary"
                size="md"
                onClick={() => setShowAddModal(true)}
                id="add-movie-trigger"
                style={{ marginLeft: "var(--space-sm)" }}
                leftIcon={<span>+</span>}
              >
                Add Movie
              </Button>
            </div>
            <div className="header-actions">
              <div className="user-controls-group">
                <StatusIndicator
                  isLoading={isLoading}
                  error={error}
                  isAiConfigured={systemStatus.health?.ai_gateway?.api_key_configured ?? false}
                  isCircuitOpen={systemStatus.health?.ai_gateway?.circuit_open ?? false}
                  consecutiveFailures={systemStatus.health?.ai_gateway?.consecutive_failures ?? 0}
                  statsLoaded={!!stats}
                  onClick={openSystemStatusModal}
                  aiProvider={aiProvider}
                  user={user || undefined}
                />
              </div>

              <button
                className="shutdown-btn"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowShutdownModal(true); }}
                title="Shut down backend and frontend services"
                id="shutdown-trigger"
              >
                <span className="shutdown-icon">⏻</span>
              </button>
            </div>
          </div>
        </header>

        <main className="container main-content">
          {/* ─── Dashboard Panel ─────────────────────────── */}
          <DashboardPanel
            onDashboardClick={(type, value) => {
              if (type === "all") {
                openModal("movies", "All Movies", "Complete library index results.", {});
              } else if (type === "rated") {
                openModal("movies", "Rated Movies", "Movies with an assigned audience rating.", { min_rating: 0.1 });
              } else if (type === "unique_genres") {
                openModal("genres", "Unique Genres", "All genres currently represented in your library.");
              } else if (type === "genre") {
                openModal("movies", `${value} Movies`, `Movies categorized under the ${value} genre.`, { genres: [value as string] });
              } else if (type === "year") {
                openModal("movies", `Movies from ${value}`, `Library releases from year ${value}.`, { year: [value as number] });
              }
            }}
          />

          {/* ─── Workspace Tabs ──────────────────────────── */}
          <div className="workspace-tabs">
            <button
              className={`workspace-tab ${activeView === "search" ? "active" : ""}`}
              onClick={() => { setActiveView("search"); handleClearResults(); }}
              id="tab-search"
            >
              <span>🔍</span> Search
            </button>
            <button
              className={`workspace-tab ${activeView === "filter" ? "active" : ""}`}
              onClick={() => { setActiveView("filter"); handleClearResults(); }}
              id="tab-filter"
            >
              <span>🔧</span> Filters
            </button>
          </div>

          {/* ─── Search View ─────────────────────────────── */}
          {activeView === "search" && (
            <SearchInterface onReset={clear} />
          )}

          {/* ─── Filter View ─────────────────────────────── */}
          {activeView === "filter" && (
            <FiltersPanel onReset={clear} />
          )}

          {/* ─── Movie Grid ──────────────────────────────── */}
          <MovieGrid resultLabel={resultLabel} />

          {/* ─── Recently Added Movies ─────────────────────── */}
          {addedMovies.length > 0 && (
            <div className="recently-added-container animate-fade-in-up" style={{ marginTop: "var(--space-2xl)" }}>
              <div className="section-divider" style={{
                height: "1px",
                background: "var(--bg-glass-border)",
                margin: "var(--space-xl) 0",
                opacity: 0.5
              }} />
              <MovieGrid
                movies={addedMovies}
                resultLabel="Recently Added"
              />
            </div>
          )}
        </main>

        {/* ─── Add Movie Modal ───────────────────────────── */}
        <AddMovieModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSubmit={addMovie}
          onSuccess={handleAddSuccess}
        />

        {/* ─── Results List Modal ────────────────────────── */}
        <ResultsListModal
          isOpen={resultsModal.isOpen}
          onClose={closeResultsModal}
          title={resultsModal.title}
          description={resultsModal.description}
          movies={resultsModal.movies}
          isLoading={resultsModal.isLoading}
          onMovieClick={setSelectedMovie}
          genres={resultsModal.genres}
          genreCounts={resultsModal.genreCounts}
          onGenreClick={(genre: string) => {
            openModal("movies", `${genre} Movies`, `Movies categorized under the ${genre} genre.`, { genres: [genre] });
          }}
          newMovieIds={newMovieIds}
          allMovies={movies}
        />

        {/* ─── Movie Detail Modal (Top layer) ────────────── */}
        <MovieDetailModal
          isOpen={selectedMovie !== null}
          onClose={() => setSelectedMovie(null)}
          movie={selectedMovie}
          aiProvider={aiProvider}
          newMovieIds={newMovieIds}
          allMovies={movies}
          health={systemStatus.health}
        />

        {/* ─── System Status Modal ────────────────────────── */}
        <SystemStatusModal
          isOpen={systemStatus.isOpen}
          onClose={closeSystemStatusModal}
          health={systemStatus.health}
          isLoading={systemStatus.isLoading}
          logs={ingestionLogs}
          aiProvider={aiProvider}
          aiProviderOptions={aiProviderOptions}
          onAiProviderChange={setAiProvider}
          onRefresh={checkSystemHealth}
        />

        {/* ─── Shutdown Confirmation Modal ────────────────── */}
        <ShutdownModal
          isOpen={showShutdownModal}
          onClose={() => setShowShutdownModal(false)}
          onConfirm={handleShutdown}
          isShuttingDown={isShuttingDown}
          user={user}
        />

        {/* ─── Refresh Warning Overlay ──────────────────── */}
        {showRefreshWarning && (
          <div className="refresh-warning-overlay">
            <div className="refresh-warning-box">
              <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
              <div style={{ marginBottom: '1rem' }}>
                You have {addedMovies.length} movie{addedMovies.length !== 1 ? 's' : ''} that will be lost!
              </div>
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                Refreshing will clear all movies you added manually.
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Global hook for diagnostic modal
function GlobalHooks({ openDiagnostics }: { openDiagnostics: () => void | Promise<void> }) {
  useEffect(() => {
    (window as unknown as Record<string, () => void | Promise<void>>).openDiagnostics = openDiagnostics;
    return () => { delete (window as unknown as Record<string, () => void | Promise<void>>).openDiagnostics; };
  }, [openDiagnostics]);
  return null;
}



export default App;
