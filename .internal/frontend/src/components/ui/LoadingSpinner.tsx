interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  message?: string;
  variant?: 'spinner' | 'dots' | 'pulse';
  color?: 'primary' | 'secondary' | 'white';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
  message,
  variant = 'spinner',
  color = 'primary'
}) => {
  const sizeStyles = {
    sm: {
      spinner: { width: '16px', height: '16px' },
      dots: { width: '32px', height: '16px' },
      pulse: { width: '16px', height: '16px' }
    },
    md: {
      spinner: { width: '24px', height: '24px' },
      dots: { width: '48px', height: '24px' },
      pulse: { width: '24px', height: '24px' }
    },
    lg: {
      spinner: { width: '32px', height: '32px' },
      dots: { width: '64px', height: '32px' },
      pulse: { width: '32px', height: '32px' }
    }
  };

  const colorStyles = {
    primary: { color: '#3b82f6' },
    secondary: { color: '#6b7280' },
    white: { color: '#ffffff' }
  };

  const messageSizeStyles = {
    sm: { fontSize: '0.75rem' },
    md: { fontSize: '0.875rem' },
    lg: { fontSize: '1rem' }
  };

  const renderSpinner = () => {
    return (
      <svg 
        style={{
          ...sizeStyles[size].spinner,
          ...colorStyles[color],
          animation: 'spin 1s linear infinite'
        }}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle 
          cx="12" 
          cy="12" 
          r="10" 
          stroke="currentColor" 
          strokeWidth="4"
          opacity="0.25"
        />
        <path 
          fill="currentColor" 
          opacity="0.75"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
    );
  };

  const renderDots = () => {
    const dotSize = size === 'sm' ? '4px' : size === 'lg' ? '8px' : '6px';
    const dotStyle = {
      width: dotSize,
      height: dotSize,
      borderRadius: '50%',
      backgroundColor: colorStyles[color].color,
      animation: 'bounce 1s infinite'
    };
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', ...sizeStyles[size].dots }}>
        <div style={{ ...dotStyle, animationDelay: '0ms' }}></div>
        <div style={{ ...dotStyle, animationDelay: '150ms' }}></div>
        <div style={{ ...dotStyle, animationDelay: '300ms' }}></div>
      </div>
    );
  };

  const renderPulse = () => {
    return (
      <div style={{ ...sizeStyles[size].pulse, ...colorStyles[color], animation: 'pulse 2s infinite' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', backgroundColor: 'currentColor', opacity: 0.75 }}></div>
      </div>
    );
  };

  const renderVariant = () => {
    switch (variant) {
      case 'dots':
        return renderDots();
      case 'pulse':
        return renderPulse();
      default:
        return renderSpinner();
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className={className}>
      {renderVariant()}
      {message && (
        <span style={{ ...colorStyles[color], ...messageSizeStyles[size], fontWeight: 500 }}>
          {message}
        </span>
      )}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-25%); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
