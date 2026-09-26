import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../store/auth';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter a username and password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res =
        mode === 'login'
          ? await authApi.login(username.trim(), password)
          : await authApi.register(username.trim(), password, registerCode.trim());
      setAuth(res.token, res.user);
      navigate('/lobby');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0c] p-4 text-white relative">
      <button
        onClick={() => navigate('/')}
        className="absolute top-6 left-6 text-white/40 hover:text-white text-sm transition"
      >
        ← Back
      </button>

      <div className="landing-enter w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-wide">The ace in the pack</h1>
          <p className="text-white/40 text-sm mt-2 tracking-wide">No real money</p>
        </div>

        <div className="flex gap-1 mb-7 p-1 bg-white/5 rounded-full">
          <button
            onClick={() => setMode('login')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
              mode === 'login' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            Sign in
          </button>
          <button
            onClick={() => setMode('register')}
            className={`flex-1 py-2 rounded-full text-sm font-medium transition ${
              mode === 'register' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
            }`}
          >
            Register
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/40 transition placeholder:text-white/30"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Password"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/40 transition placeholder:text-white/30"
          />
          {mode === 'register' && (
            <input
              value={registerCode}
              onChange={(e) => setRegisterCode(e.target.value.toUpperCase())}
              placeholder="Invite code"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none uppercase tracking-widest focus:border-white/40 transition placeholder:text-white/30"
            />
          )}
          {error && <div className="text-red-400 text-sm px-1">{error}</div>}
          <button
            onClick={submit}
            disabled={loading}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm tracking-wide hover:bg-neutral-200 disabled:opacity-50 transition"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </div>
    </div>
  );
}
