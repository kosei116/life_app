import { create } from 'zustand';

export type ViewKind = 'month' | 'week' | 'day';

interface ViewState {
  view: ViewKind;
  setView: (v: ViewKind) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  view: 'month',
  setView: (view) => set({ view }),
}));
