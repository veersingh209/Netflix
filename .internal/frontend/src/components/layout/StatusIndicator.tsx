import "../ui/Dashboard.css";

interface StatusIndicatorProps {
  isLoading: boolean;
  error: string | null;
  isAiConfigured: boolean;
  isCircuitOpen: boolean;
  statsLoaded: boolean;
  onClick?: () => void;
  aiProvider?: string;
  user?: { name: string; picture?: string };
  consecutiveFailures?: number;
}

export function StatusIndicator({
  isLoading,
  error,
  isAiConfigured,
  isCircuitOpen,
  statsLoaded,
  onClick,
  aiProvider,
  user,
  consecutiveFailures = 0
}: StatusIndicatorProps) {
    
  let statusClass = "online";
  let statusLabel = "Healthy";

  if (error || isCircuitOpen || consecutiveFailures > 0) {
    statusClass = "error";
    if (isCircuitOpen) statusLabel = "AI Gateway Error";
    else if (consecutiveFailures > 0) statusLabel = "Connection Failed";
    else statusLabel = "Server Error";
  } else if (!isAiConfigured) {
    statusClass = "offline";
    statusLabel = "Pending Connection";
  } else if (isLoading || !statsLoaded) {
    statusClass = "offline";
    statusLabel = !statsLoaded ? "Initializing..." : "Refreshing...";
  }

  const getProviderLabel = (val?: string) => {
    if (!val) return "AI Gateway";
    return val.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <button 
      className="connected-btn"
      onClick={onClick}
      title="Click to view system diagnostics and profile"
    >
      <div className="status-info">
        <div className={`status-dot ${statusClass}`} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <span style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.5)", fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {getProviderLabel(aiProvider)}
          </span>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)", fontWeight: 600 }}>
            {statusLabel}
          </span>
        </div>
      </div>
      
      {user && (
        <>
          <div className="status-user-separator" />
          <div className="status-user-info">
            <span className="user-name">{user.name}</span>
            {user.picture && (
              <img 
                src={user.picture} 
                alt={user.name} 
                className="user-avatar" 
                referrerPolicy="no-referrer"
              />
            )}
          </div>
        </>
      )}
    </button>
  );
}
