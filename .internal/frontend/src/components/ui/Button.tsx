import { type ReactNode, type ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'glass' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading,
  leftIcon,
  children,
  className = '',
  disabled,
  ...props
}, ref) => {
  const baseClass = 'custom-btn';
  const variantClass = `btn-${variant}`;
  const sizeClass = `btn-${size}`;
  const loadingClass = isLoading ? 'btn-loading' : '';

  return (
    <button
      ref={ref}
      className={`${baseClass} ${variantClass} ${sizeClass} ${loadingClass} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="spinner spinner-sm" style={{ marginRight: 'var(--space-sm)' }} />
      ) : leftIcon ? (
        <span className="btn-icon" style={{ marginRight: 'var(--space-sm)', display: 'inline-flex' }}>{leftIcon}</span>
      ) : null}
      <span className="btn-text">{children}</span>
    </button>
  );
});

Button.displayName = 'Button';
