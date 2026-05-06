import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, footer, width = 480 }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div onClick={onClose} className="modal-backdrop">
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-card"
        style={{
          maxWidth: width,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--c-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 600 }}>{title}</h2>
          <button onClick={onClose} aria-label="close" className="btn btn-sm btn-ghost" style={{ width: 28, padding: 0 }}>
            ×
          </button>
        </header>
        <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>{children}</div>
        {footer && (
          <footer
            style={{
              padding: 14,
              borderTop: '1px solid var(--c-border)',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}
