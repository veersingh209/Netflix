import "./Common.css";
import { useEffect, type ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import { LoadingSpinner } from "./LoadingSpinner";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  id?: string;
  closeOnOverlayClick?: boolean;
  contentClassName?: string;
  copyEndpoint?: string;
  copyText?: string;
  isLoading?: boolean;
  loadingMessage?: string;
  showCloseButton?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  id, 
  closeOnOverlayClick = true,
  contentClassName = "",
  copyEndpoint,
  copyText,
  isLoading = false,
  loadingMessage = "Loading...",
  showCloseButton = true
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnOverlayClick) {
        onClose();
      }
    };
    
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, closeOnOverlayClick]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay animate-fade-in" onClick={handleOverlayClick} id={id}>
      <div className={`modal-content glass-card animate-fade-in-up ${contentClassName}`}>
        {(title || showCloseButton || copyEndpoint || copyText) && (
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <div className="flex items-center gap-2">
              {(copyEndpoint || copyText) && (
                <CopyButton
                  apiEndpoint={copyEndpoint}
                  text={copyText}
                  size="sm"
                  variant="icon"
                  showFeedback={true}
                />
              )}
              {showCloseButton && (
                <button className="modal-close-btn" onClick={onClose} aria-label="Close modal">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: "14px", height: "14px" }}>
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}
        <div className="relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75 z-10">
              <LoadingSpinner message={loadingMessage} size="md" variant="spinner" color="primary" />
            </div>
          )}
          <div className={isLoading ? 'opacity-50' : ''}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
