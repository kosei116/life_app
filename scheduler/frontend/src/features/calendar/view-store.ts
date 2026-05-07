import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type ViewKind = 'month' | 'week' | 'day';

interface ViewState {
  view: ViewKind;
  setView: (v: ViewKind) => void;
}

export const useViewStore = create<ViewState>()(
  persist(
    (set) => ({
      view: 'month',
      setView: (view) => set({ view }),
    }),
    {
      name: 'scheduler-calendar-view',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
