import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useLayout = create<{ mode: 'desktop' | 'mobile'; setMode: (mode: 'desktop' | 'mobile') => void }>()(
  persist((set) => ({ mode: typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'mobile' : 'desktop', setMode: (mode) => set({ mode }) }), { name: 'poker-layout' }),
);
