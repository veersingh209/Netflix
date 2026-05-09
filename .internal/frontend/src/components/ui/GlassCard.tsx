import { type ReactNode, type HTMLAttributes, forwardRef } from 'react';

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  noPadding?: boolean;
  hoverable?: boolean;
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(({ 
  children, 
  noPadding = false, 
  hoverable = true,
  className = '',
  ...props 
}, ref) => {
  const paddingClass = noPadding ? 'p-0' : '';
  const hoverClass = hoverable ? 'glass-card-hover' : '';
  
  return (
    <div 
      ref={ref}
      className={`glass-card ${paddingClass} ${hoverClass} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

GlassCard.displayName = 'GlassCard';
