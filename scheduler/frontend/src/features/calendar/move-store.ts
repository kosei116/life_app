import { create } from 'zustand';
import type { Event } from '@life-app/types';

interface MoveState {
  target: Event | null;
  start: (event: Event) => void;
  cancel: () => void;
}

export const useMoveStore = create<MoveState>((set) => ({
  target: null,
  start: (event) => set({ target: event }),
  cancel: () => set({ target: null }),
}));
