import { useEffect, useRef, useState } from "react";
import { Brain, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SensorySettings } from "./SensorySettings";
import { useSurfaceLayout } from "../../lib/useSurfaceLayout";

const DEVIANT_CONSTRAINTS = { minWidth: 190, minHeight: 48, maxWidth: 280, maxHeight: 64, margin: 12 } as const;

export function DeviantControls() {
  const { t } = useTranslation('settings');
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const surface = useSurfaceLayout("deviant-controls", () => ({
    x: Math.max(12, window.innerWidth - 232),
    y: Math.max(12, window.innerHeight - 112),
    width: 220,
    height: 52,
  }), DEVIANT_CONSTRAINTS, true);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [open]);
  return <div data-sensory-essential="true">
    <button ref={trigger} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls="deviant-controls-dialog"
      title={t('sensory.dragControls')} onPointerDown={(event) => surface.beginMove(event, 4)} onKeyDown={surface.keyboardMove}
      onDoubleClick={() => { surface.reset(); setOpen(false); }}
      onClick={() => { if (!surface.consumeDragged()) setOpen(true); }}
      style={{ left: surface.layout.x, top: surface.layout.y, width: surface.layout.width, height: surface.layout.height }}
      className="fixed z-[550] flex touch-none items-center justify-center gap-2 rounded-full border border-outline-variant bg-surface-container px-4 py-3 text-sm text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
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
