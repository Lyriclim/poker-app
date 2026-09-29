import { Dialog } from './Dialog';
import { useT } from '../i18n';

export function ConfirmDialog({ title, text, confirmLabel, onCancel, onConfirm }: {
  title: string; text: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void;
}) {
  const t = useT();
  return <Dialog title={title} onClose={onCancel} className="breathe-dialog" intro={<><div className="breathe-symbol">♠</div><p className="eyebrow">{t('A MOMENT FOR YOURSELF')}</p></>}>
    <p className="confirm-text">{text}</p><div className="dialog-buttons">
      <button onClick={onCancel} className="ui-button">{t('Keep thinking')}</button>
      <button onClick={onConfirm} className="primary-button">{confirmLabel}</button>
    </div>
  </Dialog>;
}
