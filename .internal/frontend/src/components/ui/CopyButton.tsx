import { useCopyApi } from '../../hooks/useCopyApi';

interface CopyButtonProps {
  text?: string;
  apiEndpoint?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'button' | 'icon';
  children?: React.ReactNode;
  showFeedback?: boolean;
}

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  apiEndpoint,
  className = '',
  size = 'md',
  variant = 'button',
  children,
  showFeedback = true
}) => {
  const { copyFeedback, copyApiLink, copyText } = useCopyApi();

  const handleCopy = async () => {
    if (apiEndpoint) {
      await copyApiLink(apiEndpoint);
    } else if (text) {
      await copyText(text);
    }
  };

  const getIcon = () => {
    const iconSize = size === 'sm' ? 14 : size === 'lg' ? 20 : 16;
    
    if (!showFeedback) {
      return (
        <svg 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
        >
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      );
    }
    
    switch (copyFeedback) {
      case 'copied':
        return (
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
            className="text-green-500"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        );
      case 'error':
        return (
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
            className="text-red-500"
          >
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        );
      default:
        return (
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        );
    }
  };

  const getButtonText = () => {
    if (!showFeedback) return children || 'Copy';
    
    switch (copyFeedback) {
      case 'copied':
        return children ? children : 'Copied!';
      case 'error':
        return children ? children : 'Failed';
      default:
        return children || 'Copy';
    }
  };

  const sizeClasses = {
    sm: variant === 'button' ? 'px-2 py-1 text-xs' : 'p-1',
    md: variant === 'button' ? 'px-3 py-2 text-sm' : 'p-2',
    lg: variant === 'button' ? 'px-4 py-3 text-base' : 'p-3'
  };

  const baseClasses = `
    inline-flex items-center gap-2
    ${variant === 'button' ? 'rounded-lg border border-gray-300 bg-white hover:bg-gray-50' : 'rounded hover:bg-gray-100'}
    transition-colors duration-200
    ${sizeClasses[size]}
    ${className}
  `;

  if (variant === 'icon') {
    return (
      <button
        onClick={handleCopy}
        className={baseClasses}
        title={copyFeedback === 'copied' ? 'Copied!' : copyFeedback === 'error' ? 'Copy failed' : 'Copy'}
      >
        {getIcon()}
      </button>
    );
  }

  return (
    <button
      onClick={handleCopy}
      className={baseClasses}
      disabled={copyFeedback !== 'idle'}
    >
      {getIcon()}
      {getButtonText()}
    </button>
  );
};
