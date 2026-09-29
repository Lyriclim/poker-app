import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties, MouseEvent } from 'react';
import { useAuth } from '../store/auth';
import { LayoutSwitch } from '../components/LayoutSwitch';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { useT } from '../i18n';

export default function LandingPage() {
  const navigate = useNavigate();
  const t = useT();
  const token = useAuth((s) => s.token);
  const cardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState<CSSProperties>({});

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height; // 0..1
    setTilt({
      transform: `rotateX(${(0.5 - py) * 22}deg) rotateY(${(px - 0.5) * 22}deg)`,
      '--gx': `${px * 100}%`,
      '--gy': `${py * 100}%`,
    } as CSSProperties);
  };

  const onLeave = () => setTilt({ transform: 'rotateX(0deg) rotateY(0deg)' });

  const enter = () => navigate(token ? '/lobby' : '/login');

  return (
    <div className="h-full flex items-center justify-center bg-[#0a0a0c] text-white overflow-hidden select-none relative">
      <div className="absolute top-6 right-6 z-10 flex gap-2"><LanguageSwitch /><LayoutSwitch /></div>
      {/* 背景光晕 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.06) 0%, transparent 60%)' }}
      />

      <div className="landing-enter relative flex flex-col items-center gap-10">
        {/* 黑桃 A */}
        <div
          ref={cardRef}
          onMouseMove={onMove}
          onMouseLeave={onLeave}
          style={tilt}
          className="landing-card"
        >
          <div className="corner corner-tl">
            A<span>♠</span>
          </div>
          <div className="landing-spade">♠</div>
          <div className="corner corner-br">
            A<span>♠</span>
          </div>
          <div className="landing-glare" />
        </div>

        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-wide text-center">{t('The ace in the pack')}</h1>
        </div>

        <button
          onClick={enter}
          className="px-12 py-3.5 rounded-full border border-white/25 text-white/80 hover:bg-white hover:text-black hover:border-white transition-all duration-300 text-sm font-semibold tracking-[0.2em] pl-[0.2em]"
        >
          {t('ENTER')}
        </button>
      </div>
    </div>
  );
}
