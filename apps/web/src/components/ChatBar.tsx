import { useChatComposer } from '../lib/useChatComposer';
import { useT } from '../i18n';

export function ChatBar() {
  const t = useT();
  const { text, setText, send, disabled, connected } = useChatComposer();

  return (
    <div className="fixed bottom-4 left-4 z-40 flex items-center gap-2">
      <input
        value={text}
        maxLength={300}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) void send(); }}
        placeholder={t(connected ? 'Message…' : 'Offline · Draft kept')}
        className="w-60 bg-black/60 backdrop-blur border border-white/10 rounded-full px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition placeholder:text-white/30"
      />
      <button
        disabled={disabled}
        onClick={() => void send()}
        aria-label={t('Send')}
        className="h-10 w-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-emerald-400 active:scale-95 transition shadow-lg disabled:opacity-40"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
