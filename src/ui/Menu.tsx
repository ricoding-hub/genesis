import { useTranslation } from 'react-i18next';
import { setLanguage } from '@/i18n';
import { PanelId, useStore } from '@/state/store';

const ITEMS: { id: PanelId; icon: string; key: string }[] = [
  { id: 'god', icon: '✨', key: 'god' },
  { id: 'events', icon: '☄️', key: 'events' },
  { id: 'stats', icon: '📊', key: 'stats' },
  { id: 'civ', icon: '🏛️', key: 'civ' },
  { id: 'versus', icon: '⚔️', key: 'versus' },
];

/**
 * Primary navigation: labeled buttons that each open exactly one docked
 * panel. Top-right on desktop, a compact scrollable row on mobile.
 */
export function Menu() {
  const { t, i18n } = useTranslation();
  const panel = useStore((s) => s.panel);
  const togglePanel = useStore((s) => s.togglePanel);
  const setScenarioOpen = useStore((s) => s.setScenarioOpen);
  const setHelpOpen = useStore((s) => s.setHelpOpen);

  const restart = () => setScenarioOpen(true);

  return (
    <div className="glass absolute top-3 right-3 p-1.5 hidden md:flex items-center gap-1 flex-wrap justify-end max-w-[70vw] animate-fade-in z-20">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          className={`btn flex items-center gap-1.5 ${panel === it.id ? 'btn-active' : ''}`}
          onClick={() => togglePanel(it.id)}
          title={t(`menu.${it.key}Hint`)}
        >
          <span>{it.icon}</span>
          <span className="hidden sm:inline">{t(`menu.${it.key}`)}</span>
        </button>
      ))}
      <div className="w-px h-5 bg-white/10 mx-0.5 hidden sm:block" />
      <button
        className="btn flex items-center gap-1.5"
        onClick={restart}
        title={t('menu.worldHint')}
      >
        <span>🌍</span>
        <span className="hidden md:inline">{t('menu.world')}</span>
      </button>
      <button
        className="btn font-semibold"
        onClick={() => setLanguage(i18n.language === 'es' ? 'en' : 'es')}
        title={t('lang.switch')}
      >
        {i18n.language === 'es' ? 'ES' : 'EN'}
      </button>
      <button className="btn" onClick={() => setHelpOpen(true)} title={t('menu.help')}>
        ?
      </button>
    </div>
  );
}
