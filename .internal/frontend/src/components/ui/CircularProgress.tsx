import { useState, useEffect, useRef, useCallback } from 'react';

interface CircularProgressProps {
  duration: number; // in seconds
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
  showCountdown?: boolean;
  onComplete?: () => void;
  message?: string;
}

export const CircularProgress: React.FC<CircularProgressProps> = ({
  duration,
  size = 80,
  strokeWidth = 4,
  color = '#22c55e',
  bgColor = 'rgba(34, 197, 94, 0.2)',
  showCountdown = true,
  onComplete,
  message
}) => {
  const [progress, setProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(duration);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;
  
  // Use refs to avoid dependency array issues
  const onCompleteRef = useRef(onComplete);
  const animationRef = useRef<number | null>(null);
  
  // Keep ref updated with latest callback
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // Stable complete handler
  const handleComplete = useCallback(() => {
    onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    // Reset state when duration changes
    if (progress !== 0 || timeLeft !== duration) {
      // Use setTimeout to avoid calling setState synchronously in effect
      setTimeout(() => {
        setProgress(0);
        setTimeLeft(duration);
      }, 0);
    }
    
    const startTime = Date.now();
    const durationMs = duration * 1000;

    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, durationMs - elapsed);
      const percentComplete = ((durationMs - remaining) / durationMs) * 100;
      
      setProgress(percentComplete);
      setTimeLeft(Math.round(remaining / 1000));

      if (remaining <= 0) {
        handleComplete();
      } else {
        animationRef.current = requestAnimationFrame(updateProgress);
      }
    };

    animationRef.current = requestAnimationFrame(updateProgress);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [duration, handleComplete]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div 
      className="circular-progress-wrapper"
      style={{ 
        display: 'flex', 
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem'
      }}
    >
      <div 
        className="circular-progress-container"
        style={{ 
          position: 'relative', 
          width: `${size}px`, 
          height: `${size}px`
        }}
      >
        <svg 
          viewBox={`0 0 ${size} ${size}`}
          style={{ 
            width: '100%', 
            height: '100%', 
            transform: 'rotate(-90deg)' 
          }}
        >
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={bgColor}
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{
              strokeDasharray: circumference,
              strokeDashoffset: strokeDashoffset
            }}
          />
        </svg>
        {/* Center content - countdown or checkmark */}
        <div 
          className="center-content"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: size < 60 ? '0.9rem' : '1.2rem',
            fontWeight: 700,
            color: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {progress >= 100 ? (
            <span style={{ animation: 'success-pop 0.3s ease-out both' }}>✓</span>
          ) : showCountdown ? (
            <span>{timeLeft}s</span>
          ) : null}
        </div>
      </div>
      
      {message && (
        <div 
          className="progress-message"
          style={{
            fontSize: '0.9rem',
            color: 'var(--text-muted)',
            textAlign: 'center'
          }}
        >
          {message}
        </div>
      )}

      <style>{`
        @keyframes success-pop {
          0% {
            opacity: 0;
            transform: scale(0);
          }
          50% {
            transform: scale(1.2);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
};
