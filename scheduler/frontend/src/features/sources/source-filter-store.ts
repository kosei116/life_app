import { create } from 'zustand';

interface SourceFilterState {
  hidden: Set<string>;
  toggle: (sourceId: string) => void;
  isHidden: (sourceId: string) => boolean;
}

export const useSourceFilter = create<SourceFilterState>((set, get) => ({
  hidden: new Set(),
  toggle: (sourceId) => {
    const next = new Set(get().hidden);
    if (next.has(sourceId)) next.delete(sourceId);
    else next.add(sourceId);
    set({ hidden: next });
  },
  isHidden: (sourceId) => get().hidden.has(sourceId),
}));
