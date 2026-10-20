import { useEffect, useRef, useState } from "react";
import { Brain, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SensorySettings } from "./SensorySettings";

export function DeviantControls() {
  const { t } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  return <div data-sensory-essential="true">
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="deviant-controls-dialog"
      onClick={() => setOpen(true)} className="fixed bottom-24 right-4 z-[550] flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 py-3 text-sm text-on-surface">
      <Brain size={18} aria-hidden="true" />{t('sensory.controls')}
    </button>
    <dialog ref={dialog} id="deviant-controls-dialog" aria-label={t('sensory.title')}
      onClose={() => { setOpen(false); trigger.current?.focus(); }} onCancel={() => setOpen(false)}
      className="m-auto max-h-[85vh] w-[min(32rem,95vw)] overflow-y-auto rounded-2xl border border-outline-variant bg-background p-5 text-on-surface">
      <button type="button" aria-label={t('sensory.close')} onClick={() => setOpen(false)} className="mb-3 ml-auto flex rounded-full border border-outline-variant p-2"><X size={18} /></button>
      <SensorySettings />
      <p className="mt-4 text-xs text-on-surface-variant">{t('sensory.shortcuts')}</p>
    </dialog>
  </div>;
}
