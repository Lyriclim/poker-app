import { useState } from 'react';
import { getSocket } from '../socket';

export function ChatBar() {
  const [text, setText] = useState('');

  const send = () => {
    const t = text.trim();
    if (!t) return;
    getSocket()?.emit('chat', { text: t });
    setText('');
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && send()}
        placeholder="Message…"
        className="w-60 bg-black/60 backdrop-blur border border-white/10 rounded-full px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition placeholder:text-white/30"
      />
      <button
        onClick={send}
        aria-label="Send"
        className="h-10 w-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-emerald-400 active:scale-95 transition shadow-lg"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
