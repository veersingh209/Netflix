import "../../ui/Search.css";
/**
 * SearchInterface — Dual-mode search bar.
 *
 * Mode 1: "AI Search" (Natural Language) → /api/magic-search
 * Mode 2: "Fast Autocomplete" → /api/movies/search (200ms debounce)
 *
 * Displays AI metadata (status + parsed_filters) when AI Search is used.
 */

import { useState, useEffect, type FormEvent } from "react";
import { useCopyApi } from "../../../hooks/useCopyApi";
import { AiMetadataCard } from "./AiMetadataCard";
import { Button } from "../../ui/Button";
import { useNetflix } from "../../../hooks/useNetflixStore";

const WHIMSICAL_MESSAGES = [
  "Ready to explore the cinematic universe...",
  "The movie database awaits your query...",
  "Thousands of films are ready to be discovered...",
  "Your next favorite movie is just a search away...",
  "The cinematic oracle is standing by...",
  "Adventure, romance, comedy, and more await...",
  "Unlock the secrets of the movie collection...",
  "The film reels are spinning, waiting for your search...",
  "Your journey through cinema begins here...",
  "Discover your next movie obsession...",
];

const getRandomWhimsicalMessage = () => {
  return WHIMSICAL_MESSAGES[Math.floor(Math.random() * WHIMSICAL_MESSAGES.length)];
};

type SearchMode = "magic" | "autocomplete";

interface SearchInterfaceProps {
  onReset?: () => void;
}

export function SearchInterface({
  onReset,
}: SearchInterfaceProps) {
  const {
    searchAutocomplete,
    searchMagic,
    aiMetadata,
    aiProvider,
    dashboardSyncToFilters,
    setDashboardSyncToFilters,
    isLoading,
    switchSearchMode,
    currentSearchMode,
    searchQueries,
    systemStatus,
  } = useNetflix();

  const health = systemStatus.health;
  const onAutocompleteSearch = searchAutocomplete;
  const onMagicSearch = searchMagic;
  const onDashboardSyncToggle = setDashboardSyncToFilters;
  const [magicQuery, setMagicQuery] = useState("");
  const [autoQuery, setAutoQuery] = useState("");
  const { copyText: copyFilterText, copyFeedback: filterCopyFeedback } = useCopyApi();
  const { copyText: copyAutoText, copyFeedback: autoCopyFeedback } = useCopyApi();
  const [whimsicalPlaceholder, setWhimsicalPlaceholder] = useState(() => getRandomWhimsicalMessage());
  const [typedPlaceholder, setTypedPlaceholder] = useState("");

  // Typing animation effect
  useEffect(() => {
    let currentIndex = 0;
    const targetText = whimsicalPlaceholder;

    const typeInterval = setInterval(() => {
      if (currentIndex <= targetText.length) {
        setTypedPlaceholder(targetText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(typeInterval);
      }
    }, 35); // Type speed: 35ms per character

    return () => clearInterval(typeInterval);
  }, [whimsicalPlaceholder]);

  // Change message and restart typing animation
  useEffect(() => {
    const interval = setInterval(() => {
      setWhimsicalPlaceholder(getRandomWhimsicalMessage());
      setTypedPlaceholder("");
    }, 7000); // Change every 7 seconds (including typing time)

    return () => clearInterval(interval);
  }, []);

  const isAiReady = health?.ai_gateway?.api_key_configured && !health?.ai_gateway?.circuit_open;
  const aiStatusMessage = !health?.ai_gateway?.api_key_configured
    ? "AI provider not configured. Please set up API keys in diagnostics."
    : health?.ai_gateway?.circuit_open
      ? "AI service temporarily unavailable due to errors. Please try again later."
      : "";

  const [previousMode, setPreviousMode] = useState<"autocomplete" | "magic">(currentSearchMode);

  // Restore query state only when actually switching modes
  useEffect(() => {
    if (currentSearchMode !== previousMode) {
      // Mode actually switched, restore the appropriate query
      if (currentSearchMode === "autocomplete") {
        // Use setTimeout to avoid calling setState synchronously in effect
        setTimeout(() => setAutoQuery(searchQueries.autocomplete), 0);
      } else {
        // Use setTimeout to avoid calling setState synchronously in effect
        setTimeout(() => setMagicQuery(searchQueries.magic), 0);
      }
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => setPreviousMode(currentSearchMode), 0);
    }
  }, [currentSearchMode, previousMode, searchQueries]);

  const handleModeSwitch = (newMode: SearchMode) => {
    switchSearchMode(newMode);
  };

  const handleMagicSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (magicQuery.trim()) {
      await onMagicSearch(magicQuery.trim(), aiProvider);
    }
  };

  const handleAutoInput = (value: string) => {
    setAutoQuery(value);
    onAutocompleteSearch(value);
  };

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMagicQuery("");
    setAutoQuery("");
    onReset?.();
  };

  const hasSearchContent = magicQuery.trim() !== "" || autoQuery.trim() !== "" || aiMetadata !== null;


  const buildApiFilterLink = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
    const searchParams = new URLSearchParams();

    if (aiMetadata?.parsed_filters.title) {
      searchParams.set("title", aiMetadata.parsed_filters.title);
    }
    if (aiMetadata?.parsed_filters.genres?.length) {
      aiMetadata.parsed_filters.genres.forEach((genre) => {
        searchParams.append("genres", genre);
      });
    }
    if (aiMetadata?.parsed_filters.min_rating !== null && aiMetadata?.parsed_filters.min_rating !== undefined) {
      searchParams.set("min_rating", String(aiMetadata.parsed_filters.min_rating));
    }
    if (aiMetadata?.parsed_filters.year !== null && aiMetadata?.parsed_filters.year !== undefined) {
      if (Array.isArray(aiMetadata.parsed_filters.year)) {
        aiMetadata.parsed_filters.year.forEach((y: number) => {
          searchParams.append("year", String(y));
        });
      } else {
        searchParams.set("year", String(aiMetadata.parsed_filters.year));
      }
    }

    const queryString = searchParams.toString();
    return `${baseUrl}/api/movies/filter${queryString ? `?${queryString}` : ""}`;
  };

  const buildApiAutocompleteLink = () => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
    const searchParams = new URLSearchParams();
    if (autoQuery.trim()) {
      searchParams.set("q", autoQuery.trim());
    }
    const queryString = searchParams.toString();
    return `${baseUrl}/api/movies/search${queryString ? `?${queryString}` : ""}`;
  };

  const handleCopyApiLink = () => {
    copyFilterText(buildApiFilterLink());
  };

  const handleCopyAutocompleteLink = () => {
    copyAutoText(buildApiAutocompleteLink());
  };

  return (
    <section className="search-interface animate-fade-in-up" id="search-interface">
      <h2 className="section-title">
        <span className="section-icon">🔍</span>
        Search Movies
      </h2>

      {/* ─── Mode Toggle ──────────────────────────────── */}
      <div className="search-mode-toggle">
        <Button
          variant="glass"
          className={`mode-btn ${currentSearchMode === "autocomplete" ? "active auto" : ""}`}
          onClick={() => handleModeSwitch("autocomplete")}
          id="mode-btn-auto"
        >
          <span className="mode-btn-icon">⚡</span>
          <div className="mode-btn-text">
            <span>Fast Search</span>
            <span className="mode-btn-sub">Autocomplete</span>
          </div>
        </Button>
        <Button
          variant="glass"
          className={`mode-btn ${currentSearchMode === "magic" ? "active magic" : ""}`}
          onClick={() => handleModeSwitch("magic")}
          id="mode-btn-magic"
        >
          <span className="mode-btn-icon">✨</span>
          <div className="mode-btn-text">
            <span>AI Search</span>
            <span className="mode-btn-sub">Natural Language</span>
          </div>
        </Button>
      </div>

      <div className="search-controls-row">
        {hasSearchContent && (
          <button
            type="button"
            className="filter-reset-btn"
            onClick={(e) => handleReset(e)}
            style={{ marginRight: "var(--space-md)", padding: "0 var(--space-sm)", height: "32px" }}
          >
            Reset Search
          </button>
        )}
        <label className="search-control-toggle toggle-switch" htmlFor="sync-dashboard-toggle" style={{ marginLeft: "auto" }}>
          <input
            id="sync-dashboard-toggle"
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
      </div>

      {/* ─── AI Search Mode ────────────────────────── */}
      {currentSearchMode === "magic" && (
        <div className="search-mode-content">
          <form onSubmit={handleMagicSubmit} className="ai-search-form">
            <div className={`search-input-wrapper magic ${!isAiReady ? "disabled-ai" : ""}`}>
              <span className="search-input-icon">✨</span>
              <input
                id="magic-search-input"
                type="text"
                className="search-input"
                placeholder={isAiReady ? typedPlaceholder : "AI Search is currently unavailable..."}
                value={magicQuery}
                onChange={(e) => setMagicQuery(e.target.value)}
                autoComplete="off"
                disabled={!isAiReady}
              />
              <Button
                type="submit"
                variant="primary"
                isLoading={isLoading}
                disabled={!isAiReady || !magicQuery.trim()}
                id="magic-search-submit"
                className="search-submit-btn"
                title={aiStatusMessage}
              >
                {isAiReady ? `AI Search via ${aiProvider}` : "Connection Required"}
              </Button>
            </div>
            {!isAiReady && (
              <div className="ai-disabled-hint animate-fade-in">
                <span className="hint-icon">⚠️</span>
                <p>{aiStatusMessage}</p>
                <button type="button" className="hint-link" onClick={() => (window as unknown as Record<string, () => void>).openDiagnostics?.()}>
                  Open Diagnostics
                </button>
              </div>
            )}
          </form>

          {/* ─── AI Metadata Display ──────────────────── */}
          {aiMetadata && (
            <AiMetadataCard
              aiMetadata={aiMetadata}
              onCopyApi={handleCopyApiLink}
              copyFeedback={filterCopyFeedback}
            />
          )}
        </div>
      )}

      {/* ─── Autocomplete Mode ────────────────────────── */}
      {currentSearchMode === "autocomplete" && (
        <div className="search-mode-content">
          <div className="search-input-wrapper auto">
            <span className="search-input-icon">⚡</span>
            <input
              id="auto-search-input"
              type="text"
              className="search-input"
              placeholder={typedPlaceholder}
              value={autoQuery}
              onChange={(e) => handleAutoInput(e.target.value)}
              autoComplete="off"
            />
            {isLoading && (
              <div className="search-loading-indicator">
                <div className="spinner spinner-sm" />
              </div>
            )}
          </div>
          {autoQuery.trim() && (
            <div className="auto-api-row">
              <button
                className="copy-api-link-btn"
                onClick={handleCopyAutocompleteLink}
                title="Copy the autocomplete API endpoint"
              >
                {autoCopyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
