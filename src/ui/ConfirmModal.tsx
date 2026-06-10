import { useTranslation } from 'react-i18next';
import { useStore } from '@/state/store';

/** Centered confirmation dialog for destructive / world-changing actions. */
export function ConfirmModal() {
  const { t } = useTranslation();
  const confirm = useStore((s) => s.confirm);
  const close = useStore((s) => s.closeConfirm);
  if (!confirm) return null;

  return (
    <div
      className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4 animate-fade-in"
      style={{ pointerEvents: 'auto' }}
      onClick={close}
    >
      <div className="glass p-5 w-[360px] max-w-[92vw]" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-2">{t(confirm.titleKey, confirm.params)}</h2>
        <p className="text-xs text-slate-300 mb-4 leading-relaxed">
          {t(confirm.bodyKey, confirm.params)}
        </p>
        <div className="flex gap-2">
          <button className="btn flex-1 py-2.5" onClick={close}>
            {t('confirm.cancel')}
          </button>
          <button
            className={`btn flex-1 py-2.5 ${
              confirm.danger ? 'bg-red-500/25 border-red-400/50 text-red-100' : 'btn-active'
            }`}
            onClick={() => {
              confirm.onConfirm();
              close();
            }}
          >
            {t(confirm.confirmKey)}
          </button>
        </div>
      </div>
    </div>
  );
}
