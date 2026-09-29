import { requestTable } from '../socket';
import { useTable } from '../store/table';

/** Both chat inputs share one draft and one pending request. Never buffer sends. */
export function useChatComposer() {
  const text = useTable((s) => s.chatDraft);
  const pending = useTable((s) => s.chatSending);
  const connected = useTable((s) => s.connected);
  const setText = useTable((s) => s.setChatDraft);
  return { text, setText, send: sendChat, disabled: !connected || pending || !text.trim(), pending, connected };
}

export async function sendChat() {
    const state = useTable.getState();
    const draft = state.chatDraft;
    if (!state.connected || state.chatSending || !draft.trim()) return;
    const generation = state.generation;
    state.setChatSending(true);
    try {
      await requestTable('chat', { text: draft.trim() });
      const current = useTable.getState();
      if (current.generation === generation && current.chatDraft === draft) current.setChatDraft('');
    } catch (error) {
      if (useTable.getState().generation === generation) useTable.getState().setError((error as Error).message);
    } finally {
      if (useTable.getState().generation === generation) useTable.getState().setChatSending(false);
    }
}
