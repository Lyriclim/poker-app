import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../socket';
import { useTable } from '../store/table';

export function ChatPanel() {
  const chat = useTable((s) => s.chat);
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [chat]);

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket()?.emit('chat', { text: t });
    setText('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="text-sm font-semibold mb-2">Chat</div>
      <div ref={boxRef} className="flex-1 overflow-y-auto space-y-1.5 text-sm min-h-0">
        {chat.length === 0 && <div className="text-slate-500 text-xs">No messages yet</div>}
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
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Say something…"
          className="flex-1 bg-slate-800 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-green-500"
        />
        <button onClick={send} className="bg-green-600 hover:bg-green-500 rounded-lg px-3 text-sm">
          Send
        </button>
      </div>
    </div>
  );
}
