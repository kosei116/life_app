import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../Modal/Modal';

interface Props {
  value: string; // "yyyy-MM-ddTHH:mm" or ""
  onChange: (next: string) => void;
  placeholder?: string;
  dateOnly?: boolean;
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

const ITEM_H = 40;
const VISIBLE_ROWS = 5;
const PAD_ROWS = Math.floor(VISIBLE_ROWS / 2);

function parse(value: string) {
  if (value.length < 10) return { date: '', hour: '', minute: '' };
  const date = value.slice(0, 10);
  if (value.length < 16) return { date, hour: '', minute: '' };
  const hour = value.slice(11, 13);
  const minRaw = value.slice(14, 16);
  const minute = MINUTES.includes(minRaw) ? minRaw : '00';
  return { date, hour, minute };
}

function format(date: string, hour: string, minute: string): string {
  if (!date) return '';
  return `${date}T${hour || '00'}:${minute || '00'}`;
}

function displayLabel(value: string, dateOnly?: boolean): string {
  if (!value) return dateOnly ? '日付を選択' : '日時を選択';
  const { date, hour, minute } = parse(value);
  if (dateOnly) return date;
  return `${date} ${hour}:${minute}`;
}

export function DateTimePicker({ value, onChange, placeholder, dateOnly }: Props) {
  const [open, setOpen] = useState(false);

  const { date, hour, minute } = parse(value);

  const [draftDate, setDraftDate] = useState(date);
  const [draftHour, setDraftHour] = useState(hour || '00');
  const [draftMinute, setDraftMinute] = useState(minute || '00');

  useEffect(() => {
    if (open) {
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      setDraftDate(date || todayIso);
      setDraftHour(hour || '09');
      setDraftMinute(minute || '00');
    }
  }, [open, date, hour, minute]);

  const handleConfirm = () => {
    if (dateOnly) {
      onChange(format(draftDate, '00', '00'));
    } else {
      onChange(format(draftDate, draftHour, draftMinute));
    }
    setOpen(false);
  };

  return (
    <div className="dtp">
      <button
        type="button"
        className="dtp-trigger"
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        {value ? displayLabel(value, dateOnly) : placeholder || (dateOnly ? '日付を選択' : '日時を選択')}
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={dateOnly ? '日付を選択' : '日時を選択'}
        width={360}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setOpen(false)}>キャンセル</button>
            <button type="button" className="btn btn-primary" onClick={handleConfirm}>決定</button>
          </>
        }
      >
        <div className="dtp-modal-body">
          <CalendarGrid value={draftDate} onChange={setDraftDate} />
          {!dateOnly && (
            <>
              <div className="dtp-divider" />
              <div className="dtp-wheels">
                <Wheel options={HOURS} value={draftHour} onChange={setDraftHour} />
                <span className="dtp-colon">:</span>
                <Wheel options={MINUTES} value={draftMinute} onChange={setDraftMinute} />
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CalendarGrid({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  const initial = value ? new Date(value + 'T00:00:00') : new Date();
  const [view, setView] = useState({ y: initial.getFullYear(), m: initial.getMonth() });

  const days = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    const prevMonthDays = new Date(view.y, view.m, 0).getDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const dt = new Date(view.y, view.m - 1, d);
      cells.push({ iso: toIso(dt), day: d, inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(view.y, view.m, d);
      cells.push({ iso: toIso(dt), day: d, inMonth: true });
    }
    while (cells.length % 7 !== 0 || cells.length < 42) {
      const idx = cells.length - daysInMonth - startWeekday + 1;
      const dt = new Date(view.y, view.m + 1, idx);
      cells.push({ iso: toIso(dt), day: idx, inMonth: false });
      if (cells.length >= 42) break;
    }
    return cells;
  }, [view]);

  const todayIso = toIso(new Date());

  return (
    <div className="dtp-cal">
      <div className="dtp-cal-head">
        <button type="button" className="dtp-cal-nav" onClick={() => setView((v) => v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 })}>‹</button>
        <span className="dtp-cal-title">{view.y}年 {view.m + 1}月</span>
        <button type="button" className="dtp-cal-nav" onClick={() => setView((v) => v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 })}>›</button>
      </div>
      <div className="dtp-cal-grid">
        {WEEKDAY_LABELS.map((w, i) => (
          <div key={w} className={`dtp-cal-wd${i === 0 ? ' is-sun' : i === 6 ? ' is-sat' : ''}`}>{w}</div>
        ))}
        {days.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`dtp-cal-cell${c.inMonth ? '' : ' is-out'}${c.iso === value ? ' is-selected' : ''}${c.iso === todayIso ? ' is-today' : ''}`}
            onClick={() => onChange(c.iso)}
          >
            {c.day}
          </button>
        ))}
      </div>
    </div>
  );
}

function Wheel({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, options.indexOf(value));
    el.scrollTop = idx * ITEM_H;
  }, [options, value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: number | null = null;
    const onScroll = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const idx = Math.round(el.scrollTop / ITEM_H);
        const clamped = Math.max(0, Math.min(options.length - 1, idx));
        const nextValue = options[clamped]!;
        const desired = clamped * ITEM_H;
        if (Math.abs(el.scrollTop - desired) > 1) {
          el.scrollTo({ top: desired, behavior: 'smooth' });
        }
        if (nextValue !== valueRef.current) onChange(nextValue);
      }, 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [options, onChange]);

  const tap = (opt: string) => {
    const el = ref.current;
    if (!el) return;
    const idx = options.indexOf(opt);
    if (idx >= 0) el.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
  };

  const padRows = PAD_ROWS;

  return (
    <div className="dtp-wheel" style={{ height: ITEM_H * VISIBLE_ROWS }}>
      <div className="dtp-wheel-mark" style={{ top: ITEM_H * padRows, height: ITEM_H }} />
      <div ref={ref} className="dtp-wheel-scroll">
        {Array.from({ length: padRows }).map((_, i) => (
          <div key={`pad-top-${i}`} className="dtp-wheel-item is-pad" />
        ))}
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`dtp-wheel-item${opt === value ? ' is-active' : ''}`}
            onClick={() => tap(opt)}
          >
            {opt}
          </button>
        ))}
        {Array.from({ length: padRows }).map((_, i) => (
          <div key={`pad-bot-${i}`} className="dtp-wheel-item is-pad" />
        ))}
      </div>
    </div>
  );
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
