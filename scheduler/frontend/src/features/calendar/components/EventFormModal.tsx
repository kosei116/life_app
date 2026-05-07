import { useEffect, useMemo, useRef, useState } from 'react';
import type { Event } from '@life-app/types';
import { Modal } from '../../../components/Modal/Modal';
import { DateTimePicker } from '../../../components/DateTimePicker/DateTimePicker';
import { formatJst } from '../../../lib/date-utils';
import {
  useCreateEvent,
  useUpdateEvent,
  type CreateEventPayload,
  type UpdateEventPayload,
} from '../hooks/useEventMutations';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import {
  CATEGORIES,
  DEFAULT_CATEGORY,
  findCategoryByName,
} from '../../categories/categories';

type Mode =
  | { kind: 'create'; defaultStart: Date; defaultEnd?: Date; defaultAllDay?: boolean }
  | { kind: 'edit'; event: Event };

interface Props {
  open: boolean;
  onClose: () => void;
  mode: Mode;
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

type Freq = 'daily' | 'weekly' | 'monthly';

interface FormState {
  title: string;
  startLocal: string;
  endLocal: string;
  allDay: boolean;
  location: string;
  description: string;
  categoryId: string;
  recurrenceEnabled: boolean;
  freq: Freq;
  weekdays: number[];
  recurrenceCount: number;
  scope: 'this' | 'this_and_future' | 'all';
}

function isoToDatetimeLocal(iso: string): string {
  return formatJst(iso, "yyyy-MM-dd'T'HH:mm");
}

function dateToDatetimeLocal(d: Date): string {
  return formatJst(d.toISOString(), "yyyy-MM-dd'T'HH:mm");
}

function datetimeLocalToIso(local: string): string {
  const d = new Date(local);
  const ms = 15 * 60_000;
  d.setTime(Math.round(d.getTime() / ms) * ms);
  return d.toISOString();
}

function buildInitialState(mode: Mode): FormState {
  if (mode.kind === 'create') {
    const start = mode.defaultStart;
    const end = mode.defaultEnd ?? new Date(start.getTime() + 60 * 60_000);
    return {
      title: '',
      startLocal: dateToDatetimeLocal(start),
      endLocal: dateToDatetimeLocal(end),
      allDay: mode.defaultAllDay ?? false,
      location: '',
      description: '',
      categoryId: DEFAULT_CATEGORY.id,
      recurrenceEnabled: false,
      freq: 'weekly',
      weekdays: [],
      recurrenceCount: 10,
      scope: 'this',
    };
  }
  const ev = mode.event;
  const matched = findCategoryByName(ev.category);
  return {
    title: ev.title,
    startLocal: isoToDatetimeLocal(ev.start_at),
    endLocal: isoToDatetimeLocal(ev.end_at),
    allDay: ev.all_day,
    location: ev.location ?? '',
    description: ev.description ?? '',
    categoryId: matched?.id ?? DEFAULT_CATEGORY.id,
    recurrenceEnabled: false,
    freq: 'weekly',
    weekdays: [],
    recurrenceCount: 10,
    scope: 'this',
  };
}

export function EventFormModal({ open, onClose, mode }: Props) {
  const [state, setState] = useState<FormState>(() => buildInitialState(mode));
  const submittingRef = useRef(false);
  const create = useCreateEvent();
  const update = useUpdateEvent();

  useEffect(() => {
    if (open) {
      setState(buildInitialState(mode));
      submittingRef.current = false;
    }
  }, [open, mode]);

  const isEdit = mode.kind === 'edit';
  const isRecurringTarget = isEdit && mode.event.recurrence_group_id !== null;
  const submitting = create.isPending || update.isPending;
  const category =
    CATEGORIES.find((c) => c.id === state.categoryId) ?? DEFAULT_CATEGORY;

  const historyRange = useMemo(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 90 * 86_400_000);
    return { from, to };
  }, []);
  const { data: pastEvents = [] } = useCalendarEvents(historyRange);
  const suggestions = useMemo(() => {
    if (mode.kind !== 'create') return [];
    const seen = new Set<string>();
    const list: { title: string; categoryId: string; color: string }[] = [];
    const sorted = [...pastEvents].sort((a, b) =>
      b.start_at.localeCompare(a.start_at),
    );
    for (const ev of sorted) {
      if (!ev.title.trim()) continue;
      const cat = findCategoryByName(ev.category);
      const catId = cat?.id ?? DEFAULT_CATEGORY.id;
      const k = `${ev.title}|${catId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      list.push({
        title: ev.title,
        categoryId: catId,
        color: cat?.color ?? ev.color ?? DEFAULT_CATEGORY.color,
      });
      if (list.length >= 10) break;
    }
    return list;
  }, [pastEvents, mode.kind]);

  const rangeError = (() => {
    if (!state.startLocal || !state.endLocal) return null;
    const startMs = new Date(state.startLocal).getTime();
    const endMs = new Date(state.endLocal).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
    if (endMs <= startMs) return '終了は開始より後の時刻にしてください。';
    return null;
  })();

  const toggleWeekday = (w: number) => {
    setState((s) => ({
      ...s,
      weekdays: s.weekdays.includes(w)
        ? s.weekdays.filter((x) => x !== w)
        : [...s.weekdays, w].sort(),
    }));
  };

  const handleSubmit = async () => {
    if (submittingRef.current || submitting) return;
    if (!state.title.trim()) return;
    if (rangeError) return;
    submittingRef.current = true;

    const startIso = datetimeLocalToIso(state.startLocal);
    const endIso = datetimeLocalToIso(state.endLocal);

    if (mode.kind === 'create') {
      const payload: CreateEventPayload = {
        title: state.title.trim(),
        start: startIso,
        end: endIso,
        all_day: state.allDay,
        location: state.location || undefined,
        description: state.description || undefined,
        category: category.name,
        color: category.color,
      };
      if (state.recurrenceEnabled) {
        if (state.freq === 'weekly' && state.weekdays.length > 0) {
          payload.recurrence = {
            freq: 'weekly',
            weekdays: state.weekdays,
            count: state.recurrenceCount,
          };
        } else if (state.freq === 'daily') {
          payload.recurrence = { freq: 'daily', count: state.recurrenceCount };
        } else if (state.freq === 'monthly') {
          payload.recurrence = { freq: 'monthly', count: state.recurrenceCount };
        }
      }
      try {
        await create.mutateAsync(payload);
        onClose();
      } catch {
        submittingRef.current = false;
      }
      return;
    }

    const ev = mode.event;
    const payload: UpdateEventPayload & { id: string } = {
      id: ev.id,
      title: state.title.trim(),
      start: startIso,
      end: endIso,
      all_day: state.allDay,
      location: state.location || null,
      description: state.description || null,
      category: category.name,
      color: category.color,
    };
    if (isRecurringTarget) payload.scope = state.scope;
    try {
      await update.mutateAsync(payload);
      onClose();
    } catch {
      submittingRef.current = false;
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title={mode.kind === 'create' ? '予定を追加' : '予定を編集'}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={submitting}>
            キャンセル
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !state.title.trim() || !!rangeError}
          >
            {submitting ? '送信中...' : '保存'}
          </button>
        </>
      }
    >
      <div className="form-stack">
        {mode.kind === 'create' && suggestions.length > 0 && (
          <Field label="履歴から選択">
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 6,
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setState((prev) => ({
                      ...prev,
                      title: s.title,
                      categoryId: s.categoryId,
                    }))
                  }
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 999,
                    border: '1px solid var(--c-border)',
                    background: 'var(--c-surface)',
                    color: 'var(--c-text)',
                    fontSize: 13,
                    cursor: 'pointer',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={s.title}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: s.color,
                      flexShrink: 0,
                    }}
                  />
                  {s.title}
                </button>
              ))}
            </div>
          </Field>
        )}

        <Field label="タイトル">
          <input
            className="title-input"
            value={state.title}
            onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
            placeholder="予定の名前"
            autoFocus
            inputMode="text"
            autoComplete="off"
            enterKeyHint="next"
          />
        </Field>

        <Field label="カテゴリー">
          <div className="category-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setState((s) => ({ ...s, categoryId: c.id }))}
                className={`category-chip${state.categoryId === c.id ? ' is-active' : ''}`}
                style={{ ['--cat-color' as string]: c.color }}
              >
                <span className="category-dot" />
                {c.name}
              </button>
            ))}
          </div>
        </Field>

        <div className="form-row-2">
          <Field label="開始">
            <DateTimePicker
              value={state.startLocal}
              onChange={(v) => setState((s) => ({ ...s, startLocal: v }))}
              dateOnly={state.allDay}
            />
          </Field>
          <Field label="終了">
            <DateTimePicker
              value={state.endLocal}
              onChange={(v) => setState((s) => ({ ...s, endLocal: v }))}
              dateOnly={state.allDay}
            />
          </Field>
        </div>
        {rangeError && (
          <div role="alert" style={{ color: '#dc2626', fontSize: 13, marginTop: -4 }}>
            {rangeError}
          </div>
        )}

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={state.allDay}
            onChange={(e) => setState((s) => ({ ...s, allDay: e.target.checked }))}
          />
          終日
        </label>

        <Field label="場所">
          <input
            value={state.location}
            onChange={(e) => setState((s) => ({ ...s, location: e.target.value }))}
            placeholder="任意"
          />
        </Field>

        <Field label="メモ">
          <textarea
            value={state.description}
            onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
            rows={3}
            placeholder="任意"
          />
        </Field>

        {mode.kind === 'create' && (
          <fieldset>
            <legend>繰り返し</legend>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={state.recurrenceEnabled}
                onChange={(e) =>
                  setState((s) => ({ ...s, recurrenceEnabled: e.target.checked }))
                }
              />
              繰り返す
            </label>
            {state.recurrenceEnabled && (
              <div className="form-stack" style={{ marginTop: 10 }}>
                <div className="form-row-2">
                  <Field label="頻度">
                    <select
                      value={state.freq}
                      onChange={(e) =>
                        setState((s) => ({ ...s, freq: e.target.value as Freq }))
                      }
                    >
                      <option value="daily">毎日</option>
                      <option value="weekly">毎週</option>
                      <option value="monthly">毎月</option>
                    </select>
                  </Field>
                  <Field label="回数">
                    <input
                      type="number"
                      min={1}
                      max={520}
                      value={state.recurrenceCount}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          recurrenceCount: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                    />
                  </Field>
                </div>
                {state.freq === 'weekly' && (
                  <Field label="曜日">
                    <div className="weekday-grid">
                      {WEEKDAY_LABELS.map((label, i) => {
                        const active = state.weekdays.includes(i);
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => toggleWeekday(i)}
                            className={`weekday-btn${active ? ' is-active' : ''}`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                )}
              </div>
            )}
          </fieldset>
        )}

        {isEdit && isRecurringTarget && (
          <Field label="繰り返しの編集範囲">
            <select
              value={state.scope}
              onChange={(e) =>
                setState((s) => ({ ...s, scope: e.target.value as FormState['scope'] }))
              }
            >
              <option value="this">このイベントのみ</option>
              <option value="this_and_future">これ以降すべて</option>
              <option value="all">すべて</option>
            </select>
          </Field>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

