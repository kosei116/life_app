import type { ReactNode } from 'react';

const HOURS_PER_DAY = 24;
const GUTTER_WIDTH = 44;

interface Props {
  header: ReactNode;
  children: ReactNode;
  columnCount: number;
  allDayRow?: ReactNode; // 終日イベント表示行（任意）
}

export function TimeGridShell({ header, children, columnCount, allDayRow }: Props) {
  return (
    <div
      className="surface"
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${columnCount}, 1fr)`,
          background: 'var(--c-surface-muted)',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
        }}
      >
        <div />
        {header}
      </div>
      {allDayRow && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${columnCount}, 1fr)`,
            background: 'var(--c-surface)',
            borderBottom: '1px solid var(--c-border)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--c-text-faint)',
              padding: '4px 6px',
              textAlign: 'right',
              alignSelf: 'center',
            }}
          >
            終日
          </div>
          {allDayRow}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${GUTTER_WIDTH}px repeat(${columnCount}, 1fr)`,
          flex: 1,
          minHeight: 0,
        }}
      >
        <div
          style={{
            position: 'relative',
            height: '100%',
            borderRight: '1px solid var(--c-border)',
          }}
        >
          {Array.from({ length: HOURS_PER_DAY }).map((_, h) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: `${(h / HOURS_PER_DAY) * 100}%`,
                right: 6,
                transform: 'translateY(-50%)',
                fontSize: 9,
                color: 'var(--c-text-faint)',
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '0.02em',
              }}
            >
              {h === 0 ? '' : `${String(h).padStart(2, '0')}`}
            </div>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}
