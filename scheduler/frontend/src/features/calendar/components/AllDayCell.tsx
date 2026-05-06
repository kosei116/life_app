import type { Event } from '@life-app/types';

interface Props {
  events: Event[];
  onTapEvent: (e: Event) => void;
}

export function AllDayCell({ events, onTapEvent }: Props) {
  return (
    <div
      style={{
        borderLeft: '1px solid var(--c-border)',
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        minHeight: 24,
      }}
    >
      {events.map((ev) => {
        const color = ev.override?.color_override ?? ev.color ?? '#3b82f6';
        return (
          <button
            key={ev.id}
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
