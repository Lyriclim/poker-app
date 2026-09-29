import { useEffect, useRef } from 'react';
import { useChatComposer } from '../lib/useChatComposer';
import { useTable } from '../store/table';
import { useT } from '../i18n';

export function ChatPanel() {
  const t = useT();
  const chat = useTable((s) => s.chat);
  const { text, setText, send, disabled, pending, connected } = useChatComposer();
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [chat]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-sm font-semibold mb-2">{t('Chat')}</div>
      <div ref={boxRef} className="flex-1 overflow-y-auto space-y-1.5 text-sm min-h-0">
        {chat.length === 0 && <div className="text-slate-500 text-xs">{t('No messages yet')}</div>}
        {chat.map((m, i) => (
          <div key={i} className="break-words">
            <span className="text-slate-400">{m.username}: </span>
            <span className="text-slate-100">{m.text}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send(); }}
          placeholder={t('Say something…')}
          className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-500"
        />
        <button disabled={disabled} onClick={() => void send()} className="bg-green-600 hover:bg-green-500 rounded-lg px-3 text-sm disabled:opacity-40">
          {t(pending ? 'Sending…' : 'Send')}
        </button>
      </div>
      {!connected && <p className="text-xs text-amber-200 mt-2" role="status">{t('Reconnect to send. Your draft is kept.')}</p>}
    </div>
  );
}
