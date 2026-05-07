import { useEffect, useMemo, useState } from 'react';
import type { Event } from '@life-app/types';
import {
  addDays,
  addMonths,
  addWeeks,
  formatJst,
} from '../../../lib/date-utils';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useUpdateEvent } from '../hooks/useEventMutations';
import { useMoveStore } from '../move-store';
import { useViewStore, type ViewKind } from '../view-store';
import { shiftEventToDay } from '../move-utils';
import { EventFormModal } from './EventFormModal';
import { EventDetailModal } from './EventDetailModal';
import { toast } from '../../../components/Toast/toast-store';
import { SourceFilterBar } from '../../sources/SourceFilterBar';
import { useSourceFilter } from '../../sources/source-filter-store';
import { SourcesPanel } from '../../sources/SourcesPanel';
import { MonthView, getMonthRange } from './MonthView';
import { WeekView, getWeekRange } from './WeekView';
import { DayView, getDayRange } from './DayView';
import { useSync } from '../../sync/useSync';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create'; defaultStart: Date; defaultEnd?: Date; defaultAllDay?: boolean }
  | { kind: 'detail'; event: Event }
  | { kind: 'edit'; event: Event };

const VIEW_LABEL: Record<ViewKind, string> = { month: '月', week: '週', day: '日' };

function headerLabel(view: ViewKind, anchor: Date): string {
  if (view === 'month') return formatJst(anchor, 'yyyy年 M月');
  if (view === 'day') return formatJst(anchor, 'yyyy年 M月d日 (E)');
  return formatJst(anchor, "yyyy年 M月d日 'の週'");
}

function rangeFor(view: ViewKind, anchor: Date) {
  if (view === 'month') return getMonthRange(anchor);
  if (view === 'week') return getWeekRange(anchor);
  return getDayRange(anchor);
}

function stepAnchor(view: ViewKind, anchor: Date, dir: 1 | -1): Date {
  if (view === 'month') return addMonths(anchor, dir);
  if (view === 'week') return addWeeks(anchor, dir);
  return addDays(anchor, dir);
}

export function CalendarGrid() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [modal, setModal] = useState<ModalState>({ kind: 'none' });
  const [sourcesPanelOpen, setSourcesPanelOpen] = useState(false);
  const view = useViewStore((s) => s.view);
  const setView = useViewStore((s) => s.setView);
  const moveTarget = useMoveStore((s) => s.target);
  const startMove = useMoveStore((s) => s.start);
  const cancelMove = useMoveStore((s) => s.cancel);
  const update = useUpdateEvent();
  const sync = useSync();

  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const { data: rawEvents = [], isLoading, isError } = useCalendarEvents(range);
  const hiddenSources = useSourceFilter((s) => s.hidden);
  const events = useMemo(
    () =>
      rawEvents.filter(
        (e) => !hiddenSources.has(e.source) && e.override?.hidden !== true
      ),
    [rawEvents, hiddenSources]
  );

  useEffect(() => {
    if (!moveTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelMove();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    const prevTouchAction = document.body.style.touchAction;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      document.body.style.touchAction = prevTouchAction;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [moveTarget, cancelMove]);

  const closeModal = () => setModal({ kind: 'none' });

  const handleStartMove = (ev: Event) => {
    if (ev.source !== 'manual' && ev.source !== 'google') {
      toast.error('インポートされた予定は移動できません（読み取り専用）。');
      return;
    }
    startMove(ev);
  };

  const handleDropTo = async (day: Date) => {
    if (!moveTarget) return;
    if (formatJst(moveTarget.start_at, 'yyyy-MM-dd') === formatJst(day, 'yyyy-MM-dd')) {
      cancelMove();
      return;
    }
    const { start, end } = shiftEventToDay(moveTarget, day);
    try {
      await update.mutateAsync({ id: moveTarget.id, start, end });
    } finally {
      cancelMove();
    }
  };

  const handleDropEventAt = async (ev: Event, x: number, y: number) => {
    if (ev.source !== 'manual' && ev.source !== 'google') {
      toast.error('インポートされた予定は移動できません（読み取り専用）。');
      cancelMove();
      return;
    }
    const el = document.elementFromPoint(x, y);
    const target = el?.closest('[data-day]') as HTMLElement | null;
    const dayStr = target?.dataset.day;
    if (!dayStr) {
      cancelMove();
      return;
    }
    if (formatJst(ev.start_at, 'yyyy-MM-dd') === dayStr) {
      cancelMove();
      return;
    }
    const [yy, mm, dd] = dayStr.split('-').map(Number);
    const day = new Date(yy!, mm! - 1, dd!);
    const { start, end } = shiftEventToDay(ev, day);
    try {
      await update.mutateAsync({ id: ev.id, start, end });
    } finally {
      cancelMove();
    }
  };

  const handleAddAtDay = (day: Date) => {
    const start = new Date(day);
    start.setHours(9, 0, 0, 0);
    setModal({ kind: 'create', defaultStart: start });
  };

  const handleAddAtTime = (start: Date, end: Date) => {
    setModal({ kind: 'create', defaultStart: start, defaultEnd: end });
  };

  const handleAddAllDay = (day: Date) => {
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    setModal({ kind: 'create', defaultStart: start, defaultAllDay: true });
  };

  const viewProps = {
    anchor,
    events,
    moveTarget,
    onTapEvent: (ev: Event) => setModal({ kind: 'detail', event: ev }),
    onLongPressEvent: handleStartMove,
    onDropTo: handleDropTo,
    onDropEventAt: handleDropEventAt,
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">{headerLabel(view, anchor)}</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="segmented" role="tablist">
            {(['month', 'week', 'day'] as ViewKind[]).map((v) => (
              <button
                key={v}
                role="tab"
                aria-selected={view === v}
                className={view === v ? 'is-active' : ''}
                onClick={() => setView(v)}
              >
                {VIEW_LABEL[v]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="btn btn-sm btn-ghost" onClick={() => setAnchor((d) => stepAnchor(view, d, -1))}>‹</button>
            <button className="btn btn-sm" onClick={() => setAnchor(new Date())}>今日</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setAnchor((d) => stepAnchor(view, d, 1))}>›</button>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            title="Googleカレンダーと同期"
          >
            {sync.isPending ? '同期中…' : '同期'}
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => setSourcesPanelOpen(true)}>ソース</button>
        </div>
      </header>

      <SourceFilterBar />

      {moveTarget && (
        <div className="banner-warn">
          <span>
            移動中: <strong>{moveTarget.title}</strong> — 移動先の日付/時間をタップ
          </span>
          <button className="btn btn-sm" onClick={cancelMove}>取消</button>
        </div>
      )}

      <div className="calendar-area">
        {isError && <div style={{ color: 'var(--c-danger)', fontSize: 'var(--fs-sm)' }}>取得に失敗しました</div>}

        {view === 'month' && <MonthView {...viewProps} onAdd={handleAddAtDay} />}
        {view === 'week' && <WeekView {...viewProps} onAdd={handleAddAtTime} onAddAllDay={handleAddAllDay} />}
        {view === 'day' && <DayView {...viewProps} onAdd={handleAddAtTime} onAddAllDay={handleAddAllDay} />}
      </div>

      <EventFormModal
        open={modal.kind === 'create'}
        onClose={closeModal}
        mode={
          modal.kind === 'create'
            ? {
                kind: 'create',
                defaultStart: modal.defaultStart,
                defaultEnd: modal.defaultEnd,
                defaultAllDay: modal.defaultAllDay,
              }
            : { kind: 'create', defaultStart: new Date() }
        }
      />

      <EventFormModal
        open={modal.kind === 'edit'}
        onClose={closeModal}
        mode={
          modal.kind === 'edit'
            ? { kind: 'edit', event: modal.event }
            : { kind: 'create', defaultStart: new Date() }
        }
      />

      <SourcesPanel open={sourcesPanelOpen} onClose={() => setSourcesPanelOpen(false)} />

      <EventDetailModal
        open={modal.kind === 'detail'}
        onClose={closeModal}
        event={modal.kind === 'detail' ? modal.event : null}
        onEdit={(ev) => setModal({ kind: 'edit', event: ev })}
      />
    </div>
  );
}
