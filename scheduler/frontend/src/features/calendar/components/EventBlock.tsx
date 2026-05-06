import type { Event } from '@life-app/types';
import { useLongPress } from '../hooks/useLongPress';
import { formatJst } from '../../../lib/date-utils';

interface Props {
  event: Event;
  onTap: (event: Event) => void;
  onLongPress: (event: Event) => void;
  dimmed?: boolean;
  highlighted?: boolean;
}

export function EventBlock({ event, onTap, onLongPress, dimmed, highlighted }: Props) {
  const handlers = useLongPress({
    onLongPress: () => onLongPress(event),
    onClick: () => onTap(event),
  });

  const color = event.override?.color_override ?? event.color ?? '#6b7280';
  const cls = ['chip', dimmed && 'is-dimmed', highlighted && 'is-highlighted']
    .filter(Boolean)
    .join(' ');

  const stop = <E extends { stopPropagation: () => void }>(e: E) => e.stopPropagation();

  return (
    <div
      className={cls}
      title={event.title}
      onPointerDown={(e) => {
        stop(e);
        handlers.onPointerDown(e);
      }}
      onPointerMove={handlers.onPointerMove}
      onPointerUp={(e) => {
        stop(e);
        handlers.onPointerUp();
      }}
      onPointerCancel={handlers.onPointerCancel}
      onClick={stop}
    >
      <span className="chip-dot" style={{ color }} />
      {!event.all_day && (
        <span className="chip-time">{formatJst(event.start_at, 'HH:mm')}</span>
      )}
      <span className="chip-title">{event.title}</span>
    </div>
  );
}
