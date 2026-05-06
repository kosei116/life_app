import type { CSSProperties } from 'react';
import type { Event } from '@life-app/types';
import { useLongPress } from '../hooks/useLongPress';
import { formatJst } from '../../../lib/date-utils';

const DAY_MIN = 24 * 60;

interface Props {
  event: Event;
  dayStartUtc: Date;
  laneIndex: number;
  laneCount: number;
  onTap: (e: Event) => void;
  onLongPress: (e: Event) => void;
  dimmed?: boolean;
  highlighted?: boolean;
}

export function TimeGridEvent({
  event,
  dayStartUtc,
  laneIndex,
  laneCount,
  onTap,
  onLongPress,
  dimmed,
  highlighted,
}: Props) {
  const handlers = useLongPress({
    onLongPress: () => onLongPress(event),
    onClick: () => onTap(event),
  });

  const startMs = new Date(event.start_at).getTime();
  const endMs = new Date(event.end_at).getTime();
  const dayMs = dayStartUtc.getTime();
  const offsetMin = Math.max(0, (startMs - dayMs) / 60_000);
  const durationMin = Math.max(15, (endMs - startMs) / 60_000);

  const topPct = (offsetMin / DAY_MIN) * 100;
  const heightPct = (durationMin / DAY_MIN) * 100;
  const widthPct = 100 / laneCount;
  const leftPct = laneIndex * widthPct;

  const color = event.override?.color_override ?? event.color ?? '#4f46e5';

  const cls = [
    'tg-event',
    dimmed && 'is-dimmed',
    highlighted && 'is-highlighted',
  ]
    .filter(Boolean)
    .join(' ');

  const style = {
    top: `${topPct}%`,
    left: `calc(${leftPct}% + 2px)`,
    width: `calc(${widthPct}% - 4px)`,
    height: `calc(${heightPct}% - 2px)`,
    '--tg-color': color,
  } as CSSProperties;

  const stop = <E extends { stopPropagation: () => void }>(e: E) => e.stopPropagation();

  return (
    <div
      className={cls}
      style={style}
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
      <div className="tg-event-time">{formatJst(event.start_at, 'HH:mm')}</div>
      <div className="tg-event-title">{event.title}</div>
    </div>
  );
}

export const TIME_GRID_DAY_MIN = DAY_MIN;
