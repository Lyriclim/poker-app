import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ChatMessage, HandResult, TableView } from '@poker/shared';
import { connectSocket, disconnectSocket, getSocket } from '../socket';
import { useAuth } from '../store/auth';
import { useTable } from '../store/table';
import { PlayingCard } from '../components/PlayingCard';
import { PlayerSeat } from '../components/PlayerSeat';
import { ActionBar } from '../components/ActionBar';
import { HandResultModal } from '../components/HandResultModal';
import { ChatPanel } from '../components/ChatPanel';
import { ChatBar } from '../components/ChatBar';
import { seatPosition } from '../lib/seatLayout';
import { useDealAnimation } from '../lib/useDealAnimation';

export default function TablePage() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const token = useAuth((s) => s.token);

  const view = useTable((s) => s.view);
  const result = useTable((s) => s.result);
  const error = useTable((s) => s.error);
  const setView = useTable((s) => s.setView);
  const setResult = useTable((s) => s.setResult);
  const addChat = useTable((s) => s.addChat);
  const setError = useTable((s) => s.setError);
  const reset = useTable((s) => s.reset);

  const [sitTarget, setSitTarget] = useState<number | null>(null);
  const [buyIn, setBuyIn] = useState(1000);
  const [showChat, setShowChat] = useState(false);
  const [afkDeadline, setAfkDeadline] = useState<number | null>(null);
  const [afkSeconds, setAfkSeconds] = useState(20);

  const deal = useDealAnimation(view);
  const [bubbles, setBubbles] = useState<
    { key: number; seatIndex: number; username: string; text: string }[]
  >([]);
  const bubbleKeyRef = useRef(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!token || !roomId) return;
    reset();
    const socket = connectSocket(token);

    socket.on('tableState', (v: TableView) => {
      setView(v);
      setAfkDeadline(null);
    });
    socket.on('handResult', (r: HandResult) => setResult(r));
    socket.on('afkCheck', (p: { deadline: number }) => setAfkDeadline(p.deadline));
    socket.on('chat', (m: ChatMessage) => {
      addChat(m);
      if (m.seatIndex != null) {
        const key = bubbleKeyRef.current++;
        setBubbles((b) => [
          ...b,
          { key, seatIndex: m.seatIndex as number, username: m.username, text: m.text },
        ]);
        setTimeout(() => setBubbles((b) => b.filter((x) => x.key !== key)), 6000);
      }
    });
    socket.on('error', (p: { message: string }) => setError(p.message));
    socket.on('connect', () => socket.emit('joinTable', { roomId }));
    if (socket.connected) socket.emit('joinTable', { roomId });

    return () => {
      socket.removeAllListeners();
      disconnectSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, roomId]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error, setError]);

  useEffect(() => {
    if (afkDeadline === null) return;
    const tick = () => {
      const remain = afkDeadline - Date.now();
      if (remain <= 0) {
        setAfkDeadline(null);
        return;
      }
      setAfkSeconds(Math.ceil(remain / 1000));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [afkDeadline]);

  if (!view) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950 text-slate-400">
        加载中…
      </div>
    );
  }

  const emptySeats = Array.from({ length: view.maxPlayers }, (_, i) => i).filter(
    (i) => !view.players.some((p) => p.seatIndex === i),
  );
  const me = view.players.find((p) => p.seatIndex === view.yourSeatIndex);

  const sit = () => {
    if (sitTarget === null) return;
    getSocket()?.emit('sit', { seatIndex: sitTarget, buyIn });
    setSitTarget(null);
  };

  const leaveTable = () => {
    disconnectSocket();
    navigate('/lobby');
  };

  const copyInvite = () => {
    navigator.clipboard
      ?.writeText(view.inviteCode)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  };

  return (
    <div className="h-full flex flex-col text-white bg-[#0a0a0c]">
      {/* 顶栏 */}
      <header className="flex items-center justify-between px-4 py-2 bg-black/30 backdrop-blur border-b border-white/5">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={leaveTable} className="text-white/60 hover:text-white text-sm shrink-0">
            ← Lobby
          </button>
          {/* 房间信息：悬浮显示 */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 text-sm font-semibold text-white/90 hover:text-white px-2 py-1 rounded-lg hover:bg-white/5 transition">
              <span className="truncate max-w-[160px]">{view.roomName || 'Room'}</span>
              <span className="text-white/40 text-xs">▾</span>
            </button>
            <div className="absolute left-0 top-full pt-2 hidden group-hover:block z-50">
              <div className="w-64 bg-neutral-900/95 backdrop-blur border border-white/10 rounded-xl p-4 shadow-2xl">
                <div className="text-[11px] uppercase tracking-widest text-white/40 mb-3">Room</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-white/50">Name</span>
                    <span className="text-white truncate">{view.roomName || '—'}</span>
                  </div>
                  <div className="flex justify-between items-center gap-4">
                    <span className="text-white/50">Invite code</span>
                    <button
                      onClick={copyInvite}
                      className="font-mono tracking-widest text-emerald-300 hover:text-emerald-200 transition"
                    >
                      {view.inviteCode}
                      <span className="ml-1.5 text-[11px] text-white/40">{copied ? '✓' : 'copy'}</span>
                    </button>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-white/50">Blinds</span>
                    <span className="text-white">{view.smallBlind}/{view.bigBlind}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowChat((v) => !v)}
            className="text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition"
          >
            {showChat ? 'Hide chat' : 'Chat'}
          </button>
          {me && (
            <button
              onClick={() => getSocket()?.emit('stand')}
              className="text-sm text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-1.5 transition"
            >
              Leave
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* 牌桌 */}
        <main className="flex-1 flex flex-col items-center justify-center p-4 min-w-0">
          <div className="table-area relative w-full max-w-4xl aspect-[8/5]">
            {/* 中央：公共牌 + 底池 */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
              <div className="flex gap-2">
                {[0, 1, 2, 3, 4].map((i) =>
                  i < deal.boardRevealed && view.board[i] ? (
                    <PlayingCard key={i} card={view.board[i]} size="lg" reveal />
                  ) : i < view.board.length ? (
                    <PlayingCard key={i} faceDown size="lg" />
                  ) : (
                    <div
                      key={i}
                      className="w-14 h-20 rounded-lg border border-dashed border-white/10"
                    />
                  ),
                )}
              </div>
              {view.totalPot > 0 && (
                <div className="flex items-center gap-1.5 text-yellow-300 font-bold text-lg bg-black/45 backdrop-blur px-3.5 py-1 rounded-full shadow">
                  <span className="inline-block w-3 h-3 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 shadow" />
                  底池 {view.totalPot}
                </div>
              )}
              {view.lastActionText && (
                <div className="text-xs text-white/90 bg-black/50 px-3 py-1 rounded-full max-w-[320px] truncate shadow">
                  {view.lastActionText}
                </div>
              )}
            </div>

            {/* 已入座玩家 */}
            {view.players.map((p) => {
              const reveal = view.showdown?.players.find((s) => s.seatIndex === p.seatIndex);
              const holeCards = reveal
                ? reveal.holeCards
                : !view.showdown && p.seatIndex === view.yourSeatIndex
                  ? view.yourCards
                  : null;
              return (
                <PlayerSeat
                  key={p.seatIndex}
                  player={p}
                  isYou={p.seatIndex === view.yourSeatIndex}
                  isDealer={p.seatIndex === view.dealerSeatIndex}
                  isSmallBlind={p.seatIndex === view.smallBlindSeatIndex}
                  isBigBlind={p.seatIndex === view.bigBlindSeatIndex}
                  isAction={p.seatIndex === view.actionSeatIndex}
                  holeCards={holeCards}
                  handName={reveal?.handName ?? null}
                  isWinner={reveal?.isWinner ?? false}
                  yourSeatIndex={view.yourSeatIndex}
                  maxPlayers={view.maxPlayers}
                  revealed={deal.holesRevealed}
                  showBacks={deal.holesDealt}
                />
              );
            })}

            {/* 空座位 */}
            {emptySeats.map((i) => {
              const pos = seatPosition(i, view.yourSeatIndex, view.maxPlayers);
              return (
                <button
                  key={i}
                  onClick={() => {
                    setBuyIn(view.bigBlind * 100);
                    setSitTarget(i);
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-2 border-dashed border-white/30 text-white/40 hover:border-green-400 hover:text-green-300 flex items-center justify-center text-sm"
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                >
                  坐下
                </button>
              );
            })}

            {/* 聊天气泡 */}
            {bubbles.map((b) => {
              const pos = seatPosition(b.seatIndex, view.yourSeatIndex, view.maxPlayers);
              const bx = pos.x + (50 - pos.x) * 0.42;
              const by = pos.y + (50 - pos.y) * 0.42;
              return (
                <div
                  key={b.key}
                  className="absolute z-10 pointer-events-none"
                  style={{ left: `${bx}%`, top: `${by}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <div className="chat-bubble">
                    <div className="text-[10px] font-bold text-emerald-600 mb-0.5">{b.username}</div>
                    <div className="text-slate-800">{b.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 行动栏 */}
          <div className="mt-3 w-full max-w-4xl">
            <ActionBar view={view} />
          </div>
        </main>

        {/* 聊天侧栏 */}
        {showChat && (
          <aside className="w-72 border-l border-slate-800 bg-slate-900 p-3 shrink-0">
            <ChatPanel />
          </aside>
        )}
      </div>

      {/* 结算弹窗 */}
      {result && <HandResultModal result={result} onClose={() => setResult(null)} />}

      {/* 入座弹窗 */}
      {sitTarget !== null && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSitTarget(null)}
        >
          <div
            className="bg-slate-900 rounded-2xl p-6 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4">带入筹码</h2>
            <label className="block text-sm text-slate-400 mb-1">
              带入筹码量（最低 {view.bigBlind}）
            </label>
            <input
              type="number"
              value={buyIn}
              min={view.bigBlind}
              onChange={(e) => setBuyIn(Number(e.target.value))}
              className="w-full bg-slate-800 rounded-lg px-3 py-2 mb-4 outline-none focus:ring-1 focus:ring-green-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setSitTarget(null)}
                className="flex-1 bg-slate-700 hover:bg-slate-600 rounded-lg py-2"
              >
                取消
              </button>
              <button onClick={sit} className="flex-1 bg-green-600 hover:bg-green-500 rounded-lg py-2 font-semibold">
                入座
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 挂机检测弹窗 */}
      {afkDeadline !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-2xl p-6 w-80 text-center border border-slate-700">
            <h2 className="text-lg font-bold mb-2">您是否还在思考中？</h2>
            <p className="text-slate-400 text-sm mb-4">
              {afkSeconds} 秒内未回应将自动弃牌
            </p>
            <button
              onClick={() => {
                getSocket()?.emit('stillHere');
                setAfkDeadline(null);
              }}
              className="w-full bg-green-600 hover:bg-green-500 rounded-lg py-2 font-semibold"
            >
              我还在
            </button>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="fixed top-16 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow z-50">
          {error}
        </div>
      )}

      {/* 左下角聊天输入框 */}
      <ChatBar />
    </div>
  );
}
