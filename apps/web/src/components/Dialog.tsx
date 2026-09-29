import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, type ReactNode } from 'react';

let openDialogs = 0;
let savedOverflow = '';

export function Dialog({ title, onClose, children, intro, className = '', busy = false }: {
  title: string; onClose: () => void; children: ReactNode; intro?: ReactNode; className?: string; busy?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  const locked = useRef(busy);
  close.current = onClose;
  locked.current = busy;
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (openDialogs++ === 0) savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []);
    (focusable()[0] ?? panel.current)?.focus();
    const keyboard = (e: KeyboardEvent) => {
      // Only the topmost dialog handles keyboard input (confirmation can overlay Session).
      if (document.querySelectorAll('[data-app-dialog]').item(document.querySelectorAll('[data-app-dialog]').length - 1) !== panel.current) return;
      if (e.key === 'Escape') { e.preventDefault(); if (!locked.current) close.current(); }
      if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0], last = elements.at(-1);
        if (!first) { e.preventDefault(); panel.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || !panel.current?.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !panel.current?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); if (--openDialogs === 0) document.body.style.overflow = savedOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(<div className="dialog-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <section ref={panel} data-app-dialog tabIndex={-1} className={className} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} onClick={(e) => e.stopPropagation()}>
      {intro}<h2 id={titleId}>{title}</h2>{children}
    </section>
  </div>, document.body);
}
