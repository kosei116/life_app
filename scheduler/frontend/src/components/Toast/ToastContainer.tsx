import { useToastStore } from './toast-store';

const accent: Record<string, string> = {
  success: '#10b981',
  error: 'var(--c-danger)',
  info: 'var(--c-accent)',
};

export function ToastContainer() {
  const { toasts, dismiss } = useToastStore();

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        maxWidth: 'calc(100vw - 32px)',
      }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="toast"
          style={{
            background: 'var(--c-surface-elev)',
            color: 'var(--c-text)',
            padding: '10px 14px 10px 12px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--c-border)',
            borderLeft: `3px solid ${accent[t.kind] ?? accent.info}`,
            boxShadow: 'var(--shadow-md)',
            cursor: 'pointer',
            fontSize: 'var(--fs-md)',
            minWidth: 240,
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
