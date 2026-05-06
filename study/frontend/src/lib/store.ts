import { create } from 'zustand';

type Tab = 'timetable' | 'tasks' | 'manage';

type AppState = {
  currentSemesterId: string | null;
  setCurrentSemesterId: (id: string | null) => void;
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
};

const STORAGE_KEY = 'study.currentSemesterId';

export const useAppStore = create<AppState>((set) => ({
  currentSemesterId: localStorage.getItem(STORAGE_KEY),
  setCurrentSemesterId: (id) => {
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
    set({ currentSemesterId: id });
  },
  activeTab: 'timetable',
  setActiveTab: (t) => set({ activeTab: t }),
}));
