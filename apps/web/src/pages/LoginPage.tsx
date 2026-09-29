import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';
import { useAuth } from '../store/auth';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n';

export default function LoginPage() {
  const t = useT();
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setAuth = useAuth((s) => s.setAuth);

  const submit = async () => {
    if (!username.trim()) {
      setError('Enter your name');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await authApi.enter(username.trim());
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
        {t('← Back')}
      </button>
      <div className="absolute top-6 right-6"><LanguageSwitch /></div>

      <div className="landing-enter w-full max-w-sm">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-wide">{t('The ace in the pack')}</h1>
          <p className="text-white/40 text-sm mt-2 tracking-wide">{t('Pick a name and pull up a chair.')}</p>
        </div>

        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={20}
            autoComplete="nickname"
            aria-label={t('Your name')}
            placeholder={t('Your name')}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-white/40 transition placeholder:text-white/30"
          />
          <p className="text-white/40 text-xs px-1">{t('Use the same name next time to find your seat again.')}</p>
          {error && <div className="text-red-400 text-sm px-1">{t(error)}</div>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold text-sm tracking-wide hover:bg-neutral-200 disabled:opacity-50 transition"
          >
            {t(loading ? 'Please wait…' : 'Enter lobby')}
          </button>
        </form>
      </div>
    </div>
  );
}
