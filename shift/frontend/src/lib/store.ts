import { create } from 'zustand';

type Tab = 'calendar' | 'income' | 'settings';

type AppState = {
  activeTab: Tab;
  setActiveTab: (t: Tab) => void;
  currentMonth: { year: number; month: number }; // 1-indexed month
  setCurrentMonth: (y: number, m: number) => void;
};

const now = new Date();

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'calendar',
  setActiveTab: (t) => set({ activeTab: t }),
  currentMonth: { year: now.getFullYear(), month: now.getMonth() + 1 },
  setCurrentMonth: (year, month) => set({ currentMonth: { year, month } }),
}));
