import type { Event } from '@life-app/types';
import { useLongPress } from '../hooks/useLongPress';

interface Props {
  events: Event[];
  onTapEvent: (e: Event) => void;
  onLongPressEmpty?: () => void;
}

export function AllDayCell({ events, onTapEvent, onLongPressEmpty }: Props) {
  const handlers = useLongPress({
    onLongPress: () => onLongPressEmpty?.(),
  });

  return (
    <div
      {...(onLongPressEmpty ? handlers : {})}
      style={{
        borderLeft: '1px solid var(--c-border)',
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 24,
        minWidth: 0,
        overflow: 'hidden',
        cursor: onLongPressEmpty ? 'pointer' : undefined,
        touchAction: 'none',
      }}
    >
      {events.map((ev) => {
        const color = ev.override?.color_override ?? ev.color ?? '#3b82f6';
        return (
          <button
            key={ev.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onTapEvent(ev);
            }}
            style={{
              background: color,
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              padding: '2px 6px',
              fontSize: 11,
              textAlign: 'left',
              cursor: 'pointer',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              maxWidth: '100%',
              display: 'block',
            }}
            title={ev.title}
          >
            {ev.title}
          </button>
        );
      })}
    </div>
  );
}
