import { useAppStore } from './lib/store.js';
import { CalendarView } from './features/calendar/CalendarView.js';
import { IncomeView } from './features/income/IncomeView.js';
import { SettingsView } from './features/settings/SettingsView.js';

export function App() {
  const { activeTab, setActiveTab } = useAppStore();

  return (
    <div className="app">
      <nav className="tabs-nav">
        <button
          className={`tab-btn ${activeTab === 'calendar' ? 'active' : ''}`}
          onClick={() => setActiveTab('calendar')}
        >
          カレンダー
        </button>
        <button
          className={`tab-btn ${activeTab === 'income' ? 'active' : ''}`}
          onClick={() => setActiveTab('income')}
        >
          収入
        </button>
        <button
          className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          設定
        </button>
      </nav>

      <main className="main-content">
        <div className={`tab-content ${activeTab === 'calendar' ? 'active' : ''}`}>
          <CalendarView />
        </div>
        <div className={`tab-content ${activeTab === 'income' ? 'active' : ''}`}>
          <IncomeView />
        </div>
        <div className={`tab-content ${activeTab === 'settings' ? 'active' : ''}`}>
          <SettingsView />
        </div>
      </main>
    </div>
  );
}
