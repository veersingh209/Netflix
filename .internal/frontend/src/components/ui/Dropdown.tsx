import { useState, useEffect, useRef } from "react";
import "./Layout.css";

interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  label: string;
  icon?: string;
  options: readonly DropdownOption[] | DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  title?: string;
}

export function Dropdown({
  label,
  icon,
  options,
  value,
  onChange,
  title
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="ai-dropdown-container" ref={containerRef}>
      <button 
        className="ai-dropdown-btn"
        onClick={() => setIsOpen(!isOpen)}
        title={title}
      >
        {icon && <span className="ai-dropdown-icon">{icon}</span>}
        <span className="ai-dropdown-text">{label}: {selectedOption?.label || value}</span>
        <span className="ai-dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>
      
      {isOpen && (
        <div className="ai-dropdown-menu">
          {options.map((option) => (
            <button
              key={option.value}
              className={`ai-dropdown-option ${option.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
