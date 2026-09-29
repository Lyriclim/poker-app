import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const useChips = create<{ inBB: boolean; toggle: () => void }>()(persist((set) => ({ inBB: false, toggle: () => set((s) => ({ inBB: !s.inBB })) }), { name: 'poker-chips' }));
export function formatChips(amount: number, bb: number, inBB: boolean): string {
  return inBB ? `${Number((amount / bb).toFixed(2))} BB` : amount.toLocaleString();
}
