import { useLayout } from '../store/layout';
import { useT } from '../i18n';

export function LayoutSwitch() {
  const { mode, setMode } = useLayout();
  const t = useT();
  return <div className="layout-switch" role="group" aria-label="Layout">
    {(['desktop', 'mobile'] as const).map((value) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>{t(value === 'desktop' ? 'Desktop' : 'Mobile')}</button>)}
  </div>;
}
