import { useTranslation } from 'react-i18next';
import { PanelId, useStore } from '@/state/store';

const TABS: { id: PanelId; icon: string; key: string }[] = [
  { id: 'god', icon: '✨', key: 'god' },
  { id: 'events', icon: '☄️', key: 'events' },
  { id: 'stats', icon: '📊', key: 'stats' },
  { id: 'civ', icon: '🏛️', key: 'civ' },
  { id: 'versus', icon: '⚔️', key: 'versus' },
];

/** Native-feeling bottom tab bar — mobile only (desktop uses <Menu/>). */
export function MobileNav() {
  const { t } = useTranslation();
  const panel = useStore((s) => s.panel);
  const togglePanel = useStore((s) => s.togglePanel);

  return (
    <div className="md:hidden absolute bottom-0 inset-x-0 z-30 animate-fade-in">
      <div className="glass tab-bar mx-1.5 mb-1.5 px-1 pt-1 flex items-stretch gap-0.5 rounded-2xl">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-btn ${panel === tab.id ? 'tab-btn-active' : ''}`}
            onClick={() => togglePanel(tab.id)}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span>{t(`menu.${tab.key}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
