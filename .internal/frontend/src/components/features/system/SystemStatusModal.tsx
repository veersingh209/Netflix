import { useState, useEffect, useRef } from "react";
import type { HealthResponse } from "../../../types";
import { Modal } from "../../ui/Modal";
import { api } from "../../../apiClient";

interface SystemStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  health: HealthResponse | null;
  isLoading: boolean;
  logs?: string[];
  aiProvider: string;
  aiProviderOptions: readonly { value: string; label: string }[];
  onAiProviderChange: (value: string) => void;
  onRefresh: () => void | Promise<void>;
}

export function SystemStatusModal({ 
  isOpen, 
  onClose, 
  health, 
  isLoading, 
  logs = [],
  aiProvider,
  aiProviderOptions,
  onAiProviderChange,
  onRefresh
}: SystemStatusModalProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [noApiKey, setNoApiKey] = useState(false);
  const [isUpdatingApiKey, setIsUpdatingApiKey] = useState(false);
  const [apiKeyMessage, setApiKeyMessage] = useState("");
  const [tmdbKeyInput, setTmdbKeyInput] = useState("");
  const [omdbKeyInput, setOmdbKeyInput] = useState("");
  const [isUpdatingTmdb, setIsUpdatingTmdb] = useState(false);
  const [isUpdatingOmdb, setIsUpdatingOmdb] = useState(false);
  const [tmdbMessage, setTmdbMessage] = useState("");
  const [omdbMessage, setOmdbMessage] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Reset state when provider changes
  useEffect(() => {
    // Use setTimeout to avoid calling setState synchronously in effect
    setTimeout(() => {
      setApiKeyInput("");
      setNoApiKey(false);
      setApiKeyMessage("");
    }, 0);
  }, [aiProvider]);

  // Auto-scroll to bottom of logs when they change or when expanded
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, showLogs]);

  const handleUpdateApiKey = async () => {
    const finalKey = noApiKey ? "NONE" : apiKeyInput.trim();
    if (!finalKey) return;
    
    setIsUpdatingApiKey(true);
    setApiKeyMessage("");
    
    try {
      const response = await api.updateApiKey(aiProvider, finalKey);
      setApiKeyMessage("✅ " + (response.message || "Connected successfully!"));
      setApiKeyInput("");
    } catch (error: unknown) {
      const errorMessage = (error as { body?: { detail?: string } })?.body?.detail || (error as Error)?.message || "Unknown error";
      setApiKeyMessage("❌ " + errorMessage);
    } finally {
      setIsUpdatingApiKey(false);
      onRefresh();
    }
  };
  const handleUpdateExternalKey = async (provider: "tmdb" | "omdb") => {
    const keyInput = provider === "tmdb" ? tmdbKeyInput : omdbKeyInput;
    const setUpdating = provider === "tmdb" ? setIsUpdatingTmdb : setIsUpdatingOmdb;
    const setMessage = provider === "tmdb" ? setTmdbMessage : setOmdbMessage;
    const setInput = provider === "tmdb" ? setTmdbKeyInput : setOmdbKeyInput;

    if (!keyInput.trim()) return;

    setUpdating(true);
    setMessage("");

    try {
      const response = await api.updateApiKey(provider, keyInput.trim());
      setMessage("✅ " + (response.message || "Updated successfully!"));
      setInput("");
    } catch (error: unknown) {
      const errorMessage = (error as { body?: { detail?: string } })?.body?.detail || (error as Error)?.message || "Unknown error";
      setMessage("❌ " + errorMessage);
    } finally {
      setUpdating(false);
      onRefresh();
    }
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={<><span>⚙️</span> System Diagnostics</>}
      contentClassName={showLogs ? "modal-expanded-lg" : ""}
    >
      <div className="system-status-modal">
        {isLoading ? (
          <div className="modal-loading-center">
            <div className="spinner spinner-md" />
            <p>Fetching system health...</p>
          </div>
        ) : health ? (
          <>
            <div className="status-grid-detailed stagger-children">
              {/* System Resources */}
              <div className="status-group glass-card">
                <h4 className="status-group-title">🖥️ Server Resources</h4>
                <div className="status-item">
                  <span className="status-label">Memory (RSS)</span>
                  <span className="status-value">{health.system.memory_rss_mb.toFixed(1)} MB</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Memory (VMS)</span>
                  <span className="status-value">{health.system.memory_vms_mb.toFixed(1)} MB</span>
                </div>
                <div className="status-item">
                  <span className="status-label">CPU Usage</span>
                  <span className="status-value">{health.system.cpu_percent.toFixed(1)}%</span>
                </div>
              </div>

              {/* AI Gateway */}
              <div className="status-group glass-card ai-gateway-config">
                <h4 className="status-group-title">🧠 AI Gateway</h4>
                
                <div className="status-item provider-selector">
                  <span className="status-label">AI Model</span>
                  <select 
                    value={aiProvider} 
                    onChange={(e) => onAiProviderChange(e.target.value)}
                    className="provider-select"
                    disabled={isUpdatingApiKey}
                  >
                    {aiProviderOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="status-item">
                  <span className="status-label">Connection</span>
                  <span className={`status-value ${
                    health.ai_gateway.circuit_open || (health.ai_gateway.consecutive_failures ?? 0) > 0 
                      ? "text-red" 
                      : health.ai_gateway.api_key_configured 
                        ? "text-emerald" 
                        : "text-amber"
                  }`}>
                    {health.ai_gateway.circuit_open 
                      ? "❌ Error (Circuit Open)" 
                      : (health.ai_gateway.consecutive_failures ?? 0) > 0
                        ? "❌ Connection Failed"
                        : health.ai_gateway.api_key_configured 
                          ? "✅ Connected" 
                          : "⚠️ Pending Connection"}
                  </span>
                </div>

                <div className="api-key-config-zone">
                  <div className="api-key-header">
                    <span className="status-label">API Credentials</span>
                    <label className="search-control-toggle toggle-switch" htmlFor="no-api-key-toggle">
                      <input 
                        id="no-api-key-toggle"
                        type="checkbox" 
                        checked={noApiKey} 
                        onChange={(e) => setNoApiKey(e.target.checked)}
                        disabled={isUpdatingApiKey}
                      />
                      <span className="toggle-slider"></span>
                      <span className="toggle-label">No key required</span>
                    </label>
                  </div>
                  <div className="api-key-input-wrapper">
                    <input
                      type="password"
                      value={noApiKey ? "••••••••" : apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                      placeholder={noApiKey ? "Bypassing key..." : (health.ai_gateway.api_key_configured ? "••••••••••••••••" : "Enter API key...")}
                      className={`api-key-input ${noApiKey ? "input-disabled" : ""}`}
                      disabled={isUpdatingApiKey || noApiKey}
                    />
                    <button
                      onClick={handleUpdateApiKey}
                      disabled={( !noApiKey && !apiKeyInput.trim()) || isUpdatingApiKey}
                      className="api-key-connect-btn"
                    >
                      {isUpdatingApiKey ? "Connecting..." : "Connect"}
                    </button>
                  </div>
                  {apiKeyMessage && (
                    <div className={`api-key-message ${apiKeyMessage.includes("✅") ? "success" : "error"}`}>
                      {apiKeyMessage}
                    </div>
                  )}
                </div>

                <div className="status-meta">
                  <span>Failures: {health.ai_gateway.consecutive_failures ?? 0}</span>
                  <span className="separator">|</span>
                  <span>Timeout: {health.config.ai_timeout_seconds}s</span>
                </div>

                {/* External Enrichment Services (TMDB/OMDb) */}
                <div className="external-services-config" style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <h5 style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "0.75rem", letterSpacing: "0.05em" }}>
                    🎞️ Enrichment Databases
                  </h5>
                  
                  {/* TMDB */}
                  <div className="api-key-config-zone" style={{ marginBottom: "1rem" }}>
                    <div className="api-key-header">
                      <span className="status-label" style={{ fontSize: "0.75rem" }}>TMDB API (Primary)</span>
                      <span className={`status-tag ${health.external_services?.tmdb_configured ? "success" : "pending"}`}>
                        {health.external_services?.tmdb_configured ? "Configured" : "Not Set"}
                      </span>
                    </div>
                    <div className="api-key-input-wrapper">
                      <input
                        type="password"
                        value={tmdbKeyInput}
                        onChange={(e) => setTmdbKeyInput(e.target.value)}
                        placeholder={health.external_services?.tmdb_configured ? "••••••••••••••••" : "Enter TMDB key..."}
                        className="api-key-input"
                        disabled={isUpdatingTmdb}
                      />
                      <button
                        onClick={() => handleUpdateExternalKey("tmdb")}
                        disabled={!tmdbKeyInput.trim() || isUpdatingTmdb}
                        className="api-key-connect-btn"
                      >
                        {isUpdatingTmdb ? "Saving..." : "Save"}
                      </button>
                    </div>
                    {tmdbMessage && (
                      <div className={`api-key-message ${tmdbMessage.includes("✅") ? "success" : "error"}`}>
                        {tmdbMessage}
                      </div>
                    )}
                  </div>

                  {/* OMDb */}
                  <div className="api-key-config-zone">
                    <div className="api-key-header">
                      <span className="status-label" style={{ fontSize: "0.75rem" }}>OMDb API (Backup)</span>
                      <span className={`status-tag ${health.external_services?.omdb_configured ? "success" : "pending"}`}>
                        {health.external_services?.omdb_configured ? "Configured" : "Not Set"}
                      </span>
                    </div>
                    <div className="api-key-input-wrapper">
                      <input
                        type="password"
                        value={omdbKeyInput}
                        onChange={(e) => setOmdbKeyInput(e.target.value)}
                        placeholder={health.external_services?.omdb_configured ? "••••••••••••••••" : "Enter OMDb key..."}
                        className="api-key-input"
                        disabled={isUpdatingOmdb}
                      />
                      <button
                        onClick={() => handleUpdateExternalKey("omdb")}
                        disabled={!omdbKeyInput.trim() || isUpdatingOmdb}
                        className="api-key-connect-btn"
                      >
                        {isUpdatingOmdb ? "Saving..." : "Save"}
                      </button>
                    </div>
                    {omdbMessage && (
                      <div className={`api-key-message ${omdbMessage.includes("✅") ? "success" : "error"}`}>
                        {omdbMessage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Ingestion */}
              <div className="status-group glass-card">
                <h4 className="status-group-title">📥 Data Pipeline</h4>
                <div className="status-item">
                  <span className="status-label">Source</span>
                  <span className="status-value">Google Drive</span>
                </div>
                <div className="status-item">
                  <span className="status-label">Target ID</span>
                  <a 
                    href={`https://drive.google.com/drive/folders/${health.config.google_drive_folder_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="status-value highlight-blue link-underlined"
                    title="Click to open Google Drive folder"
                  >
                    {health.config.google_drive_folder_id}
                  </a>
                </div>
              </div>
            </div>

            {/* Expandable Log View */}
            <div className="ingestion-logs-container modal-logs">
              <button 
                className="toggle-logs-btn"
                onClick={() => setShowLogs(!showLogs)}
              >
                <span className="toggle-icon">{showLogs ? "▼" : "▶"}</span>
                {showLogs ? "Hide System Internals" : "Show System Internals"}
              </button>
                
              {showLogs && (
                <div className="logs-viewer">
                  {logs.length > 0 ? (
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
            </div>
          </>
        ) : (
          <div className="modal-error-center">
            <p>Unable to retrieve system health metrics.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
