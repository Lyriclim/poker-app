import { useLanguage } from '../i18n';
export function LanguageSwitch() {
  const language = useLanguage((state) => state.language);
  const setLanguage = useLanguage((state) => state.setLanguage);
  return <div className="language-switch" role="group" aria-label="Language / 语言"><button aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button><button aria-pressed={language === 'zh'} onClick={() => setLanguage('zh')}>中文</button></div>;
}
