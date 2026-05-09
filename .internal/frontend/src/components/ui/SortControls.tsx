import React from 'react';
import type { SortKey, SortOrder } from '../../hooks/useSorting';
import { Button } from './Button';

interface SortControlsProps {
  sortKey: SortKey;
  sortOrder: SortOrder;
  onSortChange: (key: SortKey) => void;
  isSorting?: boolean;
  className?: string;
  availableSorts?: SortKey[];
}

const sortLabels: Record<SortKey, string> = {
  title: 'Title',
  rating: 'Rating',
  year: 'Year',
  name: 'Name',
  count: 'Count'
};

export const SortControls: React.FC<SortControlsProps> = ({
  sortKey,
  sortOrder,
  onSortChange,
  isSorting = false,
  className = '',
  availableSorts = ['title', 'rating', 'year', 'name', 'count']
}) => {
  return (
    <div className={`modal-sort-controls ${className}`} style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
      <span className="sort-label" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginRight: 'var(--space-sm)' }}>Sort by:</span>
      {availableSorts.map((key) => (
        <Button
          key={key}
          variant="ghost"
          size="sm"
          onClick={() => onSortChange(key)}
          disabled={isSorting}
          className={`sort-btn ${sortKey === key ? 'active' : ''}`}
          title={`Sort by ${sortLabels[key]} ${sortKey === key ? (sortOrder === 'desc' ? 'descending' : 'ascending') : ''}`}
          style={{ 
            color: sortKey === key ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: sortKey === key ? 'rgba(255, 255, 255, 0.1)' : 'transparent'
          }}
        >
          {sortLabels[key]}
          {sortKey === key && (
            <span style={{ marginLeft: '4px' }}>
              {sortOrder === 'desc' ? '↓' : '↑'}
            </span>
          )}
        </Button>
      ))}
    </div>
  );
};
