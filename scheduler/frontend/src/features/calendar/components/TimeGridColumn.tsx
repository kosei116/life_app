import { useEffect, useRef, useState } from 'react';
import type { Event } from '@life-app/types';
import { TimeGridEvent } from './TimeGridEvent';
import { assignLanes } from '../lane-utils';
import { formatJst } from '../../../lib/date-utils';

interface Props {
  day: Date;
  dayStartUtc: Date;
  events: Event[];
  moveTarget: Event | null;
  onAdd: (start: Date, end: Date) => void;
  onTapEvent: (e: Event) => void;
  onLongPressEvent: (e: Event) => void;
  onDropTo: (day: Date) => void;
  onDropEventAt: (e: Event, x: number, y: number) => void;
}

const HOURS_PER_DAY = 24;
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 8;

function formatMin(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}

export function TimeGridColumn({
  day,
  dayStartUtc,
  events,
  moveTarget,
  onAdd,
  onTapEvent,
  onLongPressEvent,
  onDropTo,
  onDropEventAt,
}: Props) {
  const inMoveMode = moveTarget !== null;
  const colRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef<{ x: number; y: number; startMin: number } | null>(null);
  const selectingRef = useRef<{ anchorMin: number } | null>(null);
  const [selection, setSelection] = useState<{ startMin: number; endMin: number } | null>(null);

  const lanes = assignLanes(events);
  const DEFAULT_DURATION_MIN = 60;
  const MIN_DURATION_MIN = 15;

  const snapMin = (offsetY: number, totalHeight: number): number => {
    const ratio = totalHeight > 0 ? offsetY / totalHeight : 0;
    const m = Math.round((ratio * HOURS_PER_DAY * 60) / 15) * 15;
    return Math.max(0, Math.min(HOURS_PER_DAY * 60, m));
  };

  const minToDate = (m: number): Date => {
    const d = new Date(dayStartUtc);
    d.setMinutes(d.getMinutes() + m);
    return d;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (inMoveMode) return;
    if (!colRef.current) return;
    const rect = colRef.current.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const startMin = snapMin(offsetY, rect.height);
    startRef.current = { x: e.clientX, y: e.clientY, startMin };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      selectingRef.current = { anchorMin: startMin };
      setSelection({
        startMin,
        endMin: Math.min(HOURS_PER_DAY * 60, startMin + DEFAULT_DURATION_MIN),
      });
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (selectingRef.current && colRef.current) {
      const rect = colRef.current.getBoundingClientRect();
      const cur = snapMin(e.clientY - rect.top, rect.height);
      const anchor = selectingRef.current.anchorMin;
      const startMin = Math.min(anchor, cur);
      const endMin = Math.max(anchor + MIN_DURATION_MIN, cur);
      setSelection({ startMin, endMin });
      return;
    }
    if (!startRef.current || timerRef.current === null) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerUp = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (selectingRef.current && selection) {
      onAdd(minToDate(selection.startMin), minToDate(selection.endMin));
    }
    selectingRef.current = null;
    setSelection(null);
    startRef.current = null;
  };

  const onClick = () => {
    if (inMoveMode) onDropTo(day);
  };

  const isToday = formatJst(day, 'yyyy-MM-dd') === formatJst(new Date(), 'yyyy-MM-dd');

  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    if (!isToday) return;
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, [isToday]);

  const nowOffsetMin = (now.getTime() - dayStartUtc.getTime()) / 60_000;
  const showNowLine =
    isToday && nowOffsetMin >= 0 && nowOffsetMin <= HOURS_PER_DAY * 60;
  const nowTopPct = (nowOffsetMin / (HOURS_PER_DAY * 60)) * 100;

  return (
    <div
      ref={colRef}
      data-day={formatJst(day, 'yyyy-MM-dd')}
      data-time-grid="1"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      style={{
        position: 'relative',
        height: '100%',
        background: isToday
          ? 'color-mix(in srgb, var(--c-accent-soft) 55%, var(--c-surface))'
          : 'var(--c-surface)',
        borderLeft: '1px solid var(--c-border)',
        cursor: inMoveMode ? 'copy' : 'default',
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {Array.from({ length: HOURS_PER_DAY }).map((_, h) => (
        <div
          key={h}
          style={{
            position: 'absolute',
            top: `${(h / HOURS_PER_DAY) * 100}%`,
            left: 0,
            right: 0,
            height: `${100 / HOURS_PER_DAY}%`,
            borderTop:
              h % 2 === 0 ? '1px solid var(--c-border)' : '1px dashed var(--c-border)',
          }}
        />
      ))}
      {selection && (
        <div
          className="time-selection"
          style={{
            top: `${(selection.startMin / (HOURS_PER_DAY * 60)) * 100}%`,
            height: `${((selection.endMin - selection.startMin) / (HOURS_PER_DAY * 60)) * 100}%`,
          }}
        >
          <span className="time-selection-label">
            {formatMin(selection.startMin)} – {formatMin(selection.endMin)}
          </span>
        </div>
      )}
      {showNowLine && <div className="now-line" style={{ top: `${nowTopPct}%` }} />}
      {lanes.map(({ event, laneIndex, laneCount }) => (
        <TimeGridEvent
          key={event.id}
          event={event}
          dayStartUtc={dayStartUtc}
          laneIndex={laneIndex}
          laneCount={laneCount}
          onTap={onTapEvent}
          onLongPress={onLongPressEvent}
          onDropAt={onDropEventAt}
          dimmed={moveTarget !== null && moveTarget.id !== event.id}
          highlighted={moveTarget?.id === event.id}
        />
      ))}
    </div>
  );
}
