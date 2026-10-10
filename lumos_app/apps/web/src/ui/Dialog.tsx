import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Icon3D } from './icons/Icon3D';

export function Dialog({ open, onClose, title, children, wide, labelledBy }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; labelledBy?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const id = labelledBy ?? 'dlg-' + String(title).replace(/\W+/g, '-').toLowerCase();
  return (
    <dialog ref={ref} className={'dialog' + (wide ? ' dialog--wide' : '')} aria-labelledby={id} onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="dialog__inner">
          <header className="dialog__head">
            <h2 id={id}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon3D icon={X} tone="neutral" size={18} /></button>
          </header>
          <div className="dialog__body">{children}</div>
        </div>
      )}
    </dialog>
  );
}
