import type { Event } from '@life-app/types';
import { formatJst, getMonthGridDays, isSameMonth, toJstDate } from '../../../lib/date-utils';
import { useMemo } from 'react';
import { useLongPress } from '../hooks/useLongPress';
import { EventBlock } from './EventBlock';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function eventsForDay(events: Event[], day: Date): Event[] {
  const jstDay = formatJst(day, 'yyyy-MM-dd');
  return events.filter((ev) => formatJst(ev.start_at, 'yyyy-MM-dd') === jstDay);
}

interface DayCellProps {
  day: Date;
  inMonth: boolean;
  events: Event[];
  moveTarget: Event | null;
  onAdd: (day: Date) => void;
  onTapEvent: (e: Event) => void;
  onLongPressEvent: (e: Event) => void;
  onDropTo: (day: Date) => void;
  onDropEventAt: (e: Event, x: number, y: number) => void;
}

function DayCell({
  day,
  inMonth,
  events,
  moveTarget,
  onAdd,
  onTapEvent,
  onLongPressEvent,
  onDropTo,
  onDropEventAt,
}: DayCellProps) {
  const handlers = useLongPress({ onLongPress: () => onAdd(day) });
  const inMoveMode = moveTarget !== null;
  const isToday = formatJst(day, 'yyyy-MM-dd') === formatJst(new Date(), 'yyyy-MM-dd');

  const handleClick = () => {
    if (inMoveMode) onDropTo(day);
  };

  const cellClass = [
    'cell',
    !inMonth && 'is-out',
    inMoveMode && 'is-move-target',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      {...(inMoveMode ? {} : handlers)}
      onClick={handleClick}
      className={cellClass}
      data-day={formatJst(day, 'yyyy-MM-dd')}
    >
      <div className={`cell-date${isToday ? ' is-today' : ''}`}>
        {toJstDate(day).getDate()}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {events.slice(0, 3).map((ev) => (
          <EventBlock
            key={ev.id}
            event={ev}
            onTap={onTapEvent}
            onLongPress={onLongPressEvent}
            onDropAt={onDropEventAt}
            dimmed={moveTarget !== null && moveTarget.id !== ev.id}
            highlighted={moveTarget?.id === ev.id}
          />
        ))}
        {events.length > 3 && <div className="cell-more">+{events.length - 3} more</div>}
      </div>
    </div>
  );
}

interface Props {
  anchor: Date;
  events: Event[];
  moveTarget: Event | null;
  onAdd: (day: Date) => void;
  onTapEvent: (e: Event) => void;
  onLongPressEvent: (e: Event) => void;
  onDropTo: (day: Date) => void;
  onDropEventAt: (e: Event, x: number, y: number) => void;
}

export function MonthView({
  anchor,
  events,
  moveTarget,
  onAdd,
  onTapEvent,
  onLongPressEvent,
  onDropTo,
  onDropEventAt,
}: Props) {
  const days = useMemo(() => getMonthGridDays(anchor), [anchor]);
  const rowCount = days.length / 7;

  return (
    <div
      className="surface"
      style={{
        overflow: 'hidden',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'var(--c-surface-muted)',
          borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
        }}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            style={{
              padding: '8px 0',
              textAlign: 'center',
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              color: 'var(--c-text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            {w}
          </div>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))`,
          background: 'var(--c-border)',
          gap: 1,
          flex: 1,
          minHeight: 0,
        }}
      >
        {days.map((day) => (
          <DayCell
            key={day.toISOString()}
            day={day}
            inMonth={isSameMonth(day, anchor)}
            events={eventsForDay(events, day)}
            moveTarget={moveTarget}
            onAdd={onAdd}
            onTapEvent={onTapEvent}
            onLongPressEvent={onLongPressEvent}
            onDropTo={onDropTo}
            onDropEventAt={onDropEventAt}
          />
        ))}
      </div>
    </div>
  );
}

export function getMonthRange(anchor: Date): { from: Date; to: Date } {
  const days = getMonthGridDays(anchor);
  const first = days[0]!;
  const last = days[days.length - 1]!;
  const to = new Date(last);
  to.setDate(to.getDate() + 1);
  return { from: first, to };
}
