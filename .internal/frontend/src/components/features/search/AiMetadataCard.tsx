import type { AIMetadata } from "../../../types";
import "../../ui/Search.css";

interface AiMetadataCardProps {
  aiMetadata: AIMetadata;
  onCopyApi: () => void;
  copyFeedback: string;
}

export function AiMetadataCard({ aiMetadata, onCopyApi, copyFeedback }: AiMetadataCardProps) {
  const aiStatusColor = (status: string) => {
    switch (status) {
      case "success": return "emerald";
      case "no_api_key": return "amber";
      case "timeout": return "amber";
      case "circuit_open": return "red";
      default: return "blue";
    }
  };

  const aiStatusLabel = (status: string) => {
    switch (status) {
      case "success": return "AI Parsed Successfully";
      case "no_api_key": return "AI Unavailable (No API Key)";
      case "timeout": return "AI Timed Out";
      case "circuit_open": return "AI Circuit Open";
      default: return `AI Status: ${status}`;
    }
  };

  return (
    <div className="ai-metadata-card glass-card animate-fade-in" id="ai-metadata">
      <div className="ai-metadata-header">
        <div className="ai-metadata-header-row">
          <span className={`ai-status-badge ${aiStatusColor(aiMetadata.status)}`}>
            {aiStatusLabel(aiMetadata.status)}
          </span>
          <button
            type="button"
            className="copy-api-link-btn"
            onClick={onCopyApi}
            title="Copy the filter API endpoint"
          >
            {copyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
          </button>
        </div>
      </div>
      {aiMetadata.status === "success" && (
        <div className="ai-parsed-filters">
          <div className="ai-filter-label">AI Interpreted your query as:</div>
          <div className="ai-filter-chips">
            {aiMetadata.parsed_filters.title && (
              <div className="ai-filter-chip title">
                <span className="chip-label">Title</span>
                <span className="chip-value">
                  {aiMetadata.parsed_filters.title}
                </span>
              </div>
            )}
            {aiMetadata.parsed_filters.genres && aiMetadata.parsed_filters.genres.length > 0 && (
              <div className="ai-filter-chip genre">
                <span className="chip-label">Genres</span>
                <span className="chip-value">
                  {aiMetadata.parsed_filters.genres.join(", ")}
                </span>
              </div>
            )}
            {aiMetadata.parsed_filters.min_rating !== null && aiMetadata.parsed_filters.min_rating !== undefined && (
              <div className="ai-filter-chip rating">
                <span className="chip-label">Min Rating</span>
                <span className="chip-value">
                  ≥ {aiMetadata.parsed_filters.min_rating}
                </span>
              </div>
            )}
            {aiMetadata.parsed_filters.year !== null && aiMetadata.parsed_filters.year !== undefined && (
              <div className="ai-filter-chip year">
                <span className="chip-label">Year</span>
                <span className="chip-value">
                  {Array.isArray(aiMetadata.parsed_filters.year)
                    ? aiMetadata.parsed_filters.year.join(", ")
                    : aiMetadata.parsed_filters.year}
                </span>
              </div>
            )}
            {!aiMetadata.parsed_filters.title &&
              (!aiMetadata.parsed_filters.genres || aiMetadata.parsed_filters.genres.length === 0) &&
              aiMetadata.parsed_filters.min_rating === null &&
              aiMetadata.parsed_filters.year === null && (
                <div className="ai-filter-chip neutral">
                  <span className="chip-value">No specific filters extracted</span>
                </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
}
