import { useState } from 'react';
import { useIncomeMonth, useIncomeYear, useUpdateMonthlyTarget } from './hooks.js';
import { useAppStore } from '../../lib/store.js';
import { yenFormat, pad } from '../../lib/utils.js';

export function IncomeView() {
  const { currentMonth, setCurrentMonth } = useAppStore();
  const [view, setView] = useState<'month' | 'year'>('month');
  const ym = `${currentMonth.year}-${pad(currentMonth.month)}`;
  const monthQ = useIncomeMonth(ym);
  const yearQ = useIncomeYear(currentMonth.year);
  const updateTarget = useUpdateMonthlyTarget();
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState('90000');

  const navMonth = (delta: number) => {
    const d = new Date(currentMonth.year, currentMonth.month - 1 + delta, 1);
    setCurrentMonth(d.getFullYear(), d.getMonth() + 1);
  };

  return (
    <div className="income-content">
      <div className="income-summary">
        <div className="income-header">
          <div className="income-header-main">
            <h2>収入サマリー</h2>
            <div className="income-view-tabs">
              <button
                className={`income-view-tab ${view === 'month' ? 'active' : ''}`}
                onClick={() => setView('month')}
              >
                月
              </button>
              <button
                className={`income-view-tab ${view === 'year' ? 'active' : ''}`}
                onClick={() => setView('year')}
              >
                年
              </button>
            </div>
          </div>

          {view === 'month' ? (
            <div className="income-nav">
              <button className="nav-btn" onClick={() => navMonth(-1)} aria-label="前の月">←</button>
              <span className="income-period-label">{currentMonth.year}年 {currentMonth.month}月</span>
              <button className="nav-btn" onClick={() => navMonth(1)} aria-label="次の月">→</button>
            </div>
          ) : (
            <div className="income-nav">
              <button className="nav-btn" onClick={() => setCurrentMonth(currentMonth.year - 1, currentMonth.month)} aria-label="前の年">←</button>
              <span className="income-period-label">{currentMonth.year}年</span>
              <button className="nav-btn" onClick={() => setCurrentMonth(currentMonth.year + 1, currentMonth.month)} aria-label="次の年">→</button>
            </div>
          )}
        </div>

        {view === 'month' && monthQ.data && (
          <div className="income-view active">
            <div className="income-month-progress">
              <ProgressCard
                current={monthQ.data.totalPay}
                target={monthQ.data.target}
                period={`${currentMonth.year}年 ${currentMonth.month}月`}
                editingTarget={editingTarget}
                targetInput={targetInput}
                onEditTarget={() => {
                  setTargetInput(String(monthQ.data!.target));
                  setEditingTarget(true);
                }}
                onTargetChange={setTargetInput}
                onSaveTarget={async () => {
                  await updateTarget.mutateAsync({ yearMonth: ym, amount: Number(targetInput) });
                  setEditingTarget(false);
                }}
                onCancelEditTarget={() => setEditingTarget(false)}
              />
            </div>
            <div className="income-stats">
              <div className="income-stat-card">
                <h3>勤務時間</h3>
                <div className="amount">{monthQ.data.paidHours.toFixed(1)} 時間</div>
              </div>
              <div className="income-stat-card">
                <h3>シフト数</h3>
                <div className="amount">{monthQ.data.shiftCount} 件</div>
              </div>
            </div>
          </div>
        )}

        {view === 'year' && yearQ.data && (
          <div className="income-view active">
            <div className="income-year-stats">
              <StatCard title="年間総収入" amount={yenFormat(yearQ.data.totalPay)} />
              <StatCard title="月平均" amount={yenFormat(Math.round(yearQ.data.avgMonthly))} />
              <StatCard title="総労働時間" amount={`${yearQ.data.totalHours.toFixed(1)} 時間`} />
              <StatCard title="総シフト数" amount={`${yearQ.data.totalCount} 件`} />
              {yearQ.data.high && (
                <StatCard
                  title="最高月"
                  amount={yenFormat(yearQ.data.high.totalPay)}
                  sub={`${yearQ.data.high.month}月`}
                />
              )}
              {yearQ.data.low && (
                <StatCard
                  title="最低月"
                  amount={yenFormat(yearQ.data.low.totalPay)}
                  sub={`${yearQ.data.low.month}月`}
                />
              )}
            </div>
            <YearChart months={yearQ.data.months} />
          </div>
        )}
      </div>
    </div>
  );
}

type ProgressProps = {
  current: number;
  target: number;
  period: string;
  editingTarget: boolean;
  targetInput: string;
  onEditTarget: () => void;
  onTargetChange: (v: string) => void;
  onSaveTarget: () => void;
  onCancelEditTarget: () => void;
};

function ProgressCard({
  current, target, period, editingTarget, targetInput,
  onEditTarget, onTargetChange, onSaveTarget, onCancelEditTarget,
}: ProgressProps) {
  const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const radius = 90;
  const stroke = 12;
  const c = 2 * Math.PI * radius;
  const dashoffset = c * (1 - percent / 100);
  const achieved = percent >= 100;
  const remaining = Math.max(0, target - current);

  return (
    <div className="income-progress-card">
      <div className="income-progress-title">
        <h3>{period}</h3>
        {editingTarget ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
            <input
              type="number"
              value={targetInput}
              onChange={(e) => onTargetChange(e.target.value)}
              style={{ maxWidth: 140 }}
            />
            <button className="btn btn-primary" onClick={onSaveTarget}>保存</button>
            <button className="btn btn-secondary" onClick={onCancelEditTarget}>キャンセル</button>
          </div>
        ) : (
          <div className="income-progress-target">
            目標: {yenFormat(target)}
            <button
              type="button"
              onClick={onEditTarget}
              style={{
                marginLeft: 8, background: 'transparent', border: 'none',
                color: 'var(--primary-color)', cursor: 'pointer', fontSize: 'var(--text-xs)',
                textDecoration: 'underline',
              }}
            >
              編集
            </button>
          </div>
        )}
      </div>
      <div className="income-circular-progress">
        <svg className="income-progress-svg" viewBox="0 0 200 200">
          <circle cx={100} cy={100} r={radius}
            className="income-progress-background"
            stroke="var(--border-color)" strokeWidth={stroke} fill="none" />
          <circle cx={100} cy={100} r={radius}
            className={`income-progress-circle ${achieved ? 'achieved' : ''}`}
            strokeWidth={stroke} fill="none"
            strokeDasharray={c} strokeDashoffset={dashoffset}
            strokeLinecap="round" />
        </svg>
        <div className="income-progress-content">
          <div className="income-progress-amount">{yenFormat(current)}</div>
          <div className="income-progress-percent">{Math.round(percent)}%</div>
          <div className={`income-progress-remaining ${achieved ? 'achieved' : ''}`}>
            {achieved ? '目標達成！' : `あと ${yenFormat(remaining)}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, amount, sub }: { title: string; amount: string; sub?: string }) {
  return (
    <div className="income-stat-card">
      <h3>{title}</h3>
      <div className="amount">{amount}</div>
      {sub && <div className="amount-sub">{sub}</div>}
    </div>
  );
}

function YearChart({ months }: { months: { month: number; totalPay: number; count: number }[] }) {
  const max = Math.max(...months.map((m) => m.totalPay), 1);
  const yLabels = [max, Math.round(max * 0.75), Math.round(max * 0.5), Math.round(max * 0.25), 0];
  return (
    <div className="income-year-chart">
      <div className="income-year-chart-wrapper">
        <div className="income-year-chart-y-axis">
          {yLabels.map((v, i) => (
            <div key={i} className="income-year-chart-y-label">{yenFormat(v)}</div>
          ))}
        </div>
        <div className="income-year-chart-bars">
          {months.map((m) => {
            const hasData = m.totalPay > 0;
            const pct = hasData ? (m.totalPay / max) * 100 : 0;
            return (
              <div key={m.month} className="income-year-bar-wrapper">
                <div
                  className={`income-year-bar ${hasData ? 'has-data' : 'no-data'}`}
                  title={hasData
                    ? `${m.month}月\n収入: ${yenFormat(m.totalPay)}\nシフト: ${m.count}回`
                    : `${m.month}月\nデータなし`}
                >
                  <div className="income-year-bar-inner" style={{ height: `${pct}%` }}>
                    {hasData && (
                      <div className="income-year-bar-value">{yenFormat(m.totalPay)}</div>
                    )}
                  </div>
                  <div className="income-year-bar-label">{m.month}月</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
