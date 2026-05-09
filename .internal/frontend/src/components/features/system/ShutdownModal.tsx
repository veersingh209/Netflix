import type { UserInfo } from "../../../types";
import { Modal } from "../../ui/Modal";
import { CircularProgress } from "../../ui/CircularProgress";

interface ShutdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isShuttingDown: boolean;
  user?: UserInfo | null;
}

export function ShutdownModal({ isOpen, onClose, onConfirm, isShuttingDown, user }: ShutdownModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<><span>⚠️</span> System Shutdown</>}
      closeOnOverlayClick={false}
      showCloseButton={false}
    >
      <div className="shutdown-modal-content">
        {user && !isShuttingDown && (
          <div className="user-greeting-shutdown animate-fade-in">
            {user.picture && (
              <img
                src={user.picture}
                alt={user.name}
                className="user-avatar-shutdown"
                referrerPolicy="no-referrer"
              />
            )}
            <div className="greeting-text">
              <span className="hello">Leaving already,</span>
              <span className="username">{user.name} ?</span>
            </div>
          </div>
        )}
        {isShuttingDown ? (
          <div className="modal-loading-center" style={{ padding: '2rem' }}>
            <CircularProgress 
              duration={3.5}
              size={100}
              color="#ef4444"
              bgColor="rgba(239, 68, 68, 0.2)"
              message="Shutting down services..."
            />
            <p className="success-sub" style={{ marginTop: '1rem' }}>Thank you for using Netflix Movie Library Explorer. Goodbye! 👋</p>
          </div>
        ) : (
          <>
            <p className="results-modal-description">
              Are you sure you want to shut down the backend and frontend services?
              This will terminate the current session and the application will stop working.
            </p>

            <div className="form-actions" style={{ marginTop: "var(--space-xl)" }}>
              <button className="form-cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button className="form-submit-btn" onClick={onConfirm}>
                Confirm Shutdown
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
