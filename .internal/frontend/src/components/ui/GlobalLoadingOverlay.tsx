import { useState, useEffect, useRef } from "react";
import "./Layout.css";

const loadingTexts = [
  "Untangling data...",
  "Indexing movies in-memory...",
  "Populating the Top-K heaps...",
  "Warming up the Trie indices...",
  "Calibrating glassmorphism layers...",
  "Optimizing inverted index intersections...",
  "Fetching cinematic treasures from Google Drive...",
  "Building the ultimate recommendation engine...",
  "Synchronizing cinematic metadata...",
  "Preparing your personalized library...",
];


import type { UserInfo } from "../../types";

export function GlobalLoadingOverlay({ 
  isIngesting, 
  error,
  logs = [],
  user = null,
  statsLoaded = false,
  onShutdown,
  isAppShuttingDown = false
}: { 
  isIngesting: boolean, 
  error: string | null,
  logs?: string[],
  user?: UserInfo | null,
  statsLoaded?: boolean,
  onShutdown?: () => void,
  isAppShuttingDown?: boolean
}) {
  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false);
  const [fullyGone, setFullyGone] = useState(false);
  const [textIndex, setTextIndex] = useState(0);
  const [showLogs, setShowLogs] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const activeShuttingDown = isShuttingDown || isAppShuttingDown;

  useEffect(() => {
    // Ensure the loading screen is visible for at least 1s for branding/UX
    const timer = setTimeout(() => setMinLoadTimePassed(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  
  // 1. Determine if the overlay should be conceptually "hidden" 
  // (i.e., we are certain no user is coming and nothing is loading)
  const isHidden = minLoadTimePassed && !user && !isIngesting && !error && !activeShuttingDown;

  // 2. Determine if the overlay should be "fading out" 
  // (i.e., we have a user and everything is loaded)
  const isFadingOut = minLoadTimePassed && !!user && !isIngesting && statsLoaded && !error && !activeShuttingDown;

  useEffect(() => {
    if (isFadingOut) {
      // Start timer to fully remove from DOM after CSS transition
      const timer = setTimeout(() => setFullyGone(true), 800);
      return () => clearTimeout(timer);
    } else if (!isAppShuttingDown && fullyGone) {
      // Only reset fullyGone if we are NOT shutting down and currently fully gone.
      // This prevents the splash screen from flickering back if a connection error 
      // occurs while the app is closing.
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => setFullyGone(false), 0);
    }
  }, [isFadingOut, isAppShuttingDown, fullyGone]);


  
  useEffect(() => {
    if (!isIngesting) return;
    const timer = setInterval(() => {
      setTextIndex((prev) => (prev + 1) % loadingTexts.length);
    }, 2500);
    return () => clearInterval(timer);
  }, [isIngesting]);


  // Auto-scroll to bottom of logs when they change or when expanded
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showLogs]);


  const handleShutdownClick = () => {
    setShowConfirmModal(true);
  };

  const handleConfirmShutdown = async () => {
    setShowConfirmModal(false);
    setIsShuttingDown(true);
    if (onShutdown) {
      await onShutdown();
    }
  };

  const handleCancelShutdown = () => {
    setShowConfirmModal(false);
  };

  // If hidden (no user) or fully gone after fade-out, don't render anything
  // Also, if the app is shutting down and we were already in the dashboard (fullyGone),
  // do not show the loading screen again. The ShutdownModal will handle the UI.
  if (isHidden || (isFadingOut && fullyGone) || (isAppShuttingDown && fullyGone)) return null;

  return (
    <div className={`global-loading-overlay ${isFadingOut ? "fade-out" : ""}`}>
      <div className={`loading-content ${showLogs ? "expanded" : ""}`}>
        <div className="splash-brand animate-fade-in">
          <div className="netflix-n-logo">N</div>
          <div className="splash-title">
            NETFLIX <span className="explorer-text">Explorer</span>
          </div>
          {user && (
            <div className="user-greeting-splash animate-fade-in-up">
              {user.picture && (
                <img 
                  src={user.picture} 
                  alt={user.name} 
                  className="user-avatar-splash" 
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="greeting-text">
                <span className="hello">Welcome,</span>
                <span className="username">{user.name}</span>
              </div>
            </div>
          )}
        </div>

        <div className="splash-status-container">
          <div className="progress-bar-container">
            <div className="progress-bar-fill"></div>
          </div>
          
          <div className="loading-text-wrapper">
            <div className="loading-text">
              {error ? (
                <span className="loading-error-msg">⚠️ {error}</span>
              ) : activeShuttingDown ? (
                <span className="loading-shutdown-msg">⏻ Shutting down...</span>
              ) : (
                loadingTexts[textIndex]
              )}
            </div>
            <div className="loading-subtext">
              {activeShuttingDown ? "Terminating Netflix Explorer..." : (isIngesting && user) ? "Synchronizing with Google Drive..." : "Initializing System Components..."}
            </div>
          </div>
        </div>

        <div className="ingestion-logs-container">
          <button 
            className="toggle-logs-btn"
            onClick={() => setShowLogs(!showLogs)}
            disabled={activeShuttingDown}
          >
            <span className="toggle-icon">{showLogs ? "▼" : "▶"}</span>
            {showLogs ? "Hide System Internals" : "Show System Internals"}
          </button>
            
          {showLogs && (
            <div className="logs-viewer">
              {logs && logs.length > 0 ? (
                logs.map((log, i) => {
                  const parts = String(log).split(" │ ");
                  return (
                    <div key={i} className="log-entry">
                      <span className="log-timestamp">{parts[0] || ""}</span>
                      <span className="log-message">{parts[1] || ""}</span>
                    </div>
                  );
                })
              ) : (
                <div className="log-entry">
                  <span className="log-message" style={{ opacity: 0.5 }}>No system logs available.</span>
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          )}

          {onShutdown && (
            <button 
              className={`shutdown-btn-splash ${activeShuttingDown ? "shutting-down" : ""}`}
              onClick={handleShutdownClick}
              disabled={activeShuttingDown}
              title={activeShuttingDown ? "Shutting down..." : "Stop Netflix Explorer"}
            >
              <span className="shutdown-icon">
                {activeShuttingDown ? "⏳" : "⏻"}
              </span>
              <span>{activeShuttingDown ? "Stopping..." : "Stop"}</span>
            </button>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <div className="confirm-modal-overlay">
          <div className="confirm-modal">
            <div className="confirm-modal-header">
              <h3>Confirm Shutdown</h3>
            </div>
            <div className="confirm-modal-body">
              <p>Are you sure you want to stop Netflix Explorer?</p>
              <p className="confirm-modal-subtext">This will terminate the application and all ongoing processes.</p>
            </div>
            <div className="confirm-modal-actions">
              <button 
                className="confirm-modal-btn confirm-modal-cancel"
                onClick={handleCancelShutdown}
              >
                Cancel
              </button>
              <button 
                className="confirm-modal-btn confirm-modal-confirm"
                onClick={handleConfirmShutdown}
              >
                Stop Netflix Explorer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
