import { useState, type FormEvent } from "react";
import type { MovieResponse, AddMovieRequest } from "../../../types";
import { Modal } from "../../ui/Modal";
import { CircularProgress } from "../../ui/CircularProgress";

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (movie: AddMovieRequest) => Promise<unknown>;
  onSuccess: (newMovie: MovieResponse) => void;
}

export function AddMovieModal({ isOpen, onClose, onSubmit, onSuccess }: AddMovieModalProps) {
  const [title, setTitle] = useState("");
  const [genreInput, setGenreInput] = useState("");
  const [rating, setRating] = useState("");
  const [year, setYear] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<"idle" | "copied" | "error">("idle");

  const handleCopyApiLink = () => {
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
      const url = `${baseUrl}/api/movies`;
      navigator.clipboard.writeText(url);
      setCopyFeedback("copied");
      setTimeout(() => setCopyFeedback("idle"), 2000);
    } catch {
      setCopyFeedback("error");
      setTimeout(() => setCopyFeedback("idle"), 2000);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const genres = genreInput.split(",").map(g => g.trim()).filter(Boolean);
      const result = await onSubmit({
        title: title.trim(),
        genre: genres,
        rating: rating ? parseFloat(rating) : null,
        year: year ? parseInt(year, 10) : null,
      }) as MovieResponse;
      setSuccess(true);
      onSuccess(result);
      // Modal will auto-close via CircularProgress onComplete callback
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add movie");
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setTitle(""); setGenreInput(""); setRating(""); setYear("");
    setError(null); setSuccess(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      showCloseButton={!success}
      closeOnOverlayClick={!success}
      title={!success && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <span><span>➕</span> Add New Movie</span>
          <button 
            className="copy-api-link-btn" 
            onClick={handleCopyApiLink}
            title="Copy the API endpoint for adding movies"
            style={{ padding: "0.25rem 0.75rem", fontSize: "0.75rem", marginLeft: "1rem" }}
          >
            {copyFeedback === "copied" ? "✓ Copied!" : "Copy API"}
          </button>
        </div>
      )}
      id="add-movie-modal"
    >
      {success ? (
        <div className="modal-success" style={{ textAlign: 'center', padding: '2rem' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <CircularProgress 
              duration={2}
              size={100}
              onComplete={handleClose}
              color="var(--red-primary)"
              bgColor="rgba(229, 9, 20, 0.2)"
            />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
            Movie Added Successfully!
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            The library has been updated. Closing in 2 seconds...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="add-movie-form">
          <div className="form-group">
            <label className="form-label" htmlFor="add-movie-title">Title *</label>
            <input id="add-movie-title" type="text" className="form-input" placeholder="e.g. Inception" value={title} onChange={e => setTitle(e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="add-movie-genres">Genres</label>
            <input id="add-movie-genres" type="text" className="form-input" placeholder="e.g. Sci-Fi, Thriller" value={genreInput} onChange={e => setGenreInput(e.target.value)} />
            <div className="form-hint">Comma-separated values</div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label className="form-label" htmlFor="add-movie-rating">Rating</label>
              <input id="add-movie-rating" type="number" className="form-input" placeholder="0–10" min="0" max="10" step="0.1" value={rating} onChange={e => setRating(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="add-movie-year">Year</label>
              <input id="add-movie-year" type="number" className="form-input" placeholder="e.g. 2010" min="1888" max="2030" value={year} onChange={e => setYear(e.target.value)} />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions">
            <button type="button" className="form-cancel-btn" onClick={handleClose}>Cancel</button>
            <button type="submit" className="form-submit-btn" disabled={isSubmitting} id="add-movie-submit">
              {isSubmitting ? (<><div className="spinner spinner-sm" /> Adding...</>) : "Add Movie"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
