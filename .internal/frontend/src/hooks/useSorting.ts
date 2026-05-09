import { useState, useCallback } from 'react';
import { sortItems, type SortKey, type SortOrder } from '../utils/sorting';

export type { SortKey, SortOrder };

interface UseSortingOptions {
  defaultSortKey?: SortKey;
  defaultSortOrder?: SortOrder;
  animationDuration?: number;
}

interface UseSortingReturn<T> {
  sortKey: SortKey;
  sortOrder: SortOrder;
  isSorting: boolean;
  sortedItems: T[];
  toggleSort: (key: SortKey) => void;
  setSortKey: (key: SortKey) => void;
  setSortOrder: (order: SortOrder) => void;
}

export const useSorting = <T extends Record<string, unknown>>(
  items: T[],
  options: UseSortingOptions = {}
): UseSortingReturn<T> => {
  const {
    defaultSortKey = "rating",
    defaultSortOrder = "desc",
    animationDuration = 700
  } = options;

  const [sortKey, setSortKey] = useState<SortKey>(defaultSortKey);
  const [sortOrder, setSortOrder] = useState<SortOrder>(defaultSortOrder);
  const [isSorting, setIsSorting] = useState(false);

  const toggleSort = useCallback((key: SortKey) => {
    setIsSorting(true);
    setTimeout(() => setIsSorting(false), animationDuration);
    
    if (sortKey === key) {
      setSortOrder(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("desc");
    }
  }, [sortKey, animationDuration]);

  const sortedItems = sortItems(items, sortKey, sortOrder);

  return {
    sortKey,
    sortOrder,
    isSorting,
    sortedItems,
    toggleSort,
    setSortKey,
    setSortOrder
  };
};
