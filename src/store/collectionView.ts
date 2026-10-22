import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { EMPTY_FILTERS, type CollectionFilters, type SortKey } from '@/features/collection/filtering';

interface CollectionViewState {
  filters: CollectionFilters;
  sort: SortKey;
  mode: 'grid' | 'list';
  setFilters: (f: Partial<CollectionFilters>) => void;
  resetFilters: () => void;
  setSort: (s: SortKey) => void;
  setMode: (m: 'grid' | 'list') => void;
}

export const useCollectionView = create<CollectionViewState>()(
  persist(
    (set) => ({
      filters: EMPTY_FILTERS,
      sort: 'investment',
      mode: 'grid',
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: EMPTY_FILTERS }),
      setSort: (sort) => set({ sort }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'gocompass.collectionView.v1',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // keep the user's sort/mode but start every session with a clean filter set
      partialize: (s) => ({ sort: s.sort, mode: s.mode }),
    },
  ),
);
