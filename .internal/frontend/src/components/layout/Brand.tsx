import "../ui/Layout.css";

interface BrandProps {
  showSubtitle?: boolean;
}

export function Brand({ showSubtitle = true }: BrandProps) {
  return (
    <div className="header-brand">
      <div>
        <div className="header-logo">
          <span className="text-gradient-red">NETFLIX</span>{" "}
          <span style={{ fontWeight: 400, color: "var(--text-secondary)" }}>Explorer</span>
        </div>
        {showSubtitle && <div className="header-subtitle">Movie Library • Full Application</div>}
      </div>
    </div>
  );
}
