import { useRef, useState } from 'react';
import type { ClientToServerEvents } from '@poker/shared';
import { requestTable } from '../socket';
import { useTable } from '../store/table';

/** Shared command feedback and a synchronous lock against double clicks. */
export function useTableCommand() {
  const [pending, setPending] = useState(false);
  const locked = useRef(false);
  const run = async <E extends keyof ClientToServerEvents>(event: E, ...args: Parameters<ClientToServerEvents[E]>): Promise<boolean> => {
    if (locked.current) return false;
    locked.current = true; setPending(true);
    try { await requestTable(event, ...args); return true; }
    catch (error) { useTable.getState().setError((error as Error).message); return false; }
    finally { locked.current = false; setPending(false); }
  };
  return { pending, run };
}
