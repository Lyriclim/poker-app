import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomPublic } from '@poker/shared';
import { roomsApi } from '../api';
import { useAuth } from '../store/auth';

export default function LobbyPage() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const navigate = useNavigate();

  const [rooms, setRooms] = useState<RoomPublic[]>([]);
  const [name, setName] = useState('');
  const [sb, setSb] = useState(5);
  const [bb, setBb] = useState(10);
  const [max, setMax] = useState(9);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      setRooms(await roomsApi.list());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, []);

  const create = async () => {
    setError('');
    try {
      const room = await roomsApi.create({ name, smallBlind: sb, bigBlind: bb, maxPlayers: max });
      navigate(`/table/${room.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const joinByCode = async () => {
    setError('');
    try {
      const room = await roomsApi.byCode(code.trim());
      navigate(`/table/${room.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-full bg-[#0a0a0c] text-white p-6">
      <header className="max-w-4xl mx-auto flex items-center justify-between mb-10">
        <h1 className="text-xl font-bold tracking-wide">The ace in the pack</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-white/50">{user?.username}</span>
          <button
            onClick={doLogout}
            className="text-sm text-white/50 hover:text-white transition"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 创建房间 */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6">
          <h2 className="text-base font-semibold mb-5">Create table</h2>
          <div className="space-y-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Table name (optional)"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/40 transition placeholder:text-white/30"
            />
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs text-white/40 flex flex-col gap-1.5">
                Small blind
                <input
                  type="number"
                  value={sb}
                  onChange={(e) => setSb(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-white/40 transition"
                />
              </label>
              <label className="text-xs text-white/40 flex flex-col gap-1.5">
                Big blind
                <input
                  type="number"
                  value={bb}
                  onChange={(e) => setBb(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-white/40 transition"
                />
              </label>
              <label className="text-xs text-white/40 flex flex-col gap-1.5">
                Players
                <input
                  type="number"
                  min={2}
                  max={9}
                  value={max}
                  onChange={(e) => setMax(Number(e.target.value))}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-white/40 transition"
                />
              </label>
            </div>
            <button
              onClick={create}
              className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition"
            >
              Create &amp; enter
            </button>
          </div>
        </div>

        {/* 加入房间 */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex flex-col">
          <h2 className="text-base font-semibold mb-5">Join with invite code</h2>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && joinByCode()}
              placeholder="6-digit code"
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none uppercase tracking-widest focus:border-white/40 transition placeholder:text-white/30"
            />
            <button
              onClick={joinByCode}
              className="px-5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition"
            >
              Join
            </button>
          </div>

          <div className="mt-6 flex-1">
            <h3 className="text-xs uppercase tracking-widest text-white/40 mb-3">Open tables</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {rooms.length === 0 && <div className="text-white/30 text-sm">No open tables</div>}
              {rooms.map((r) => (
                <button
                  key={r.id}
                  onClick={() => navigate(`/table/${r.id}`)}
                  className="w-full text-left bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between transition"
                >
                  <div>
                    <div className="text-sm font-medium">{r.name || 'Table'}</div>
                    <div className="text-xs text-white/40">
                      Blinds {r.smallBlind}/{r.bigBlind}
                    </div>
                  </div>
                  <div className="text-xs text-white/50">
                    {r.playerCount}/{r.maxPlayers}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="fixed top-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow z-50">
          {error}
        </div>
      )}
    </div>
  );
}
