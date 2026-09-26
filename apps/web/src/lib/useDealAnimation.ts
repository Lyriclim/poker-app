import { useEffect, useRef, useState } from 'react';
import type { TableView } from '@poker/shared';

export interface DealState {
  boardRevealed: number; // 已翻开的公共牌数量（0..5）
  holesDealt: boolean; // 底牌是否已盖着出现
  holesRevealed: boolean; // 本人底牌是否已翻开
}

const HOLE_APPEAR_MS = 350; // 底牌盖着出现
const HOLE_FLIP_PAUSE_MS = 700; // 出现后停顿，再翻
const BOARD_FLIP_PAUSE_MS = 750; // 公共牌盖着出现后停顿
const BOARD_FLIP_GAP_MS = 420; // 逐张翻开的间隔

export function useDealAnimation(view: TableView | null): DealState {
  const [boardRevealed, setBoardRevealed] = useState(0);
  const [holesDealt, setHolesDealt] = useState(false);
  const [holesRevealed, setHolesRevealed] = useState(false);

  const prevRef = useRef<TableView | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = timersRef;
    return () => timers.current.forEach((t) => clearTimeout(t));
  }, []);

  useEffect(() => {
    if (!view) return;
    const prev = prevRef.current;
    prevRef.current = view;

    const schedule = (fn: () => void, ms: number) => {
      timersRef.current.push(window.setTimeout(fn, ms));
    };
    const clearAll = () => {
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current = [];
    };

    // 首次同步：直接展示当前状态（比如中途加入）
    if (!prev) {
      setBoardRevealed(view.board.length);
      setHolesDealt(true);
      setHolesRevealed(true);
      return;
    }

    // 新的一手：底牌盖着出现 → 停顿 → 翻开本人底牌
    if (view.handNumber !== prev.handNumber) {
      clearAll();
      setBoardRevealed(0);
      setHolesDealt(false);
      setHolesRevealed(false);
      schedule(() => setHolesDealt(true), HOLE_APPEAR_MS);
      schedule(() => setHolesRevealed(true), HOLE_APPEAR_MS + HOLE_FLIP_PAUSE_MS);
      return;
    }

    // 发公共牌：盖着出现（view.board 变多即出现）→ 停顿 → 逐张翻开
    if (view.board.length > prev.board.length) {
      const prevLen = prev.board.length;
      const newCount = view.board.length - prevLen;
      clearAll();
      setBoardRevealed(prevLen);
      setHolesDealt(true);
      setHolesRevealed(true);
      for (let i = 0; i < newCount; i++) {
        schedule(() => setBoardRevealed((r) => r + 1), BOARD_FLIP_PAUSE_MS + i * BOARD_FLIP_GAP_MS);
      }
      return;
    }
  }, [view]);

  return { boardRevealed, holesDealt, holesRevealed };
}
