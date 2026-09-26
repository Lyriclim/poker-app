import { create } from 'zustand';
import type { TableView, HandResult, ChatMessage } from '@poker/shared';

interface TableState {
  view: TableView | null;
  result: HandResult | null;
  chat: ChatMessage[];
  error: string | null;
  setView: (view: TableView) => void;
  setResult: (result: HandResult | null) => void;
  addChat: (msg: ChatMessage) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useTable = create<TableState>()((set) => ({
  view: null,
  result: null,
  chat: [],
  error: null,
  setView: (view) => set({ view }),
  setResult: (result) => set({ result }),
  addChat: (msg) => set((s) => ({ chat: [...s.chat.slice(-99), msg] })),
  setError: (error) => set({ error }),
  reset: () => set({ view: null, result: null, chat: [], error: null }),
}));
