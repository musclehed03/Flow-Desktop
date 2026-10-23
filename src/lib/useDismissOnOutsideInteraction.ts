import { useEffect, useRef, type RefObject } from "react";

interface DismissOnOutsideInteractionOptions {
  open: boolean;
  onDismiss: () => void;
  additionalRefs?: readonly RefObject<HTMLElement | null>[];
  restoreFocusRef?: RefObject<HTMLElement | null>;
}

export function useDismissOnOutsideInteraction<T extends HTMLElement>({
  open,
  onDismiss,
  additionalRefs = [],
  restoreFocusRef,
}: DismissOnOutsideInteractionOptions): RefObject<T | null> {
  const boundaryRef = useRef<T>(null);
  const optionsRef = useRef({ additionalRefs, onDismiss, restoreFocusRef });
  optionsRef.current = { additionalRefs, onDismiss, restoreFocusRef };

  useEffect(() => {
    if (!open) return;

    let dismissed = false;
    const isInside = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return false;
      return [boundaryRef, ...optionsRef.current.additionalRefs].some((ref) => ref.current?.contains(target));
    };
    const dismiss = (restoreFocus = false) => {
      if (dismissed) return;
      dismissed = true;
      optionsRef.current.onDismiss();
      if (restoreFocus) optionsRef.current.restoreFocusRef?.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) dismiss();
    };
    const onFocusIn = (event: FocusEvent) => {
      if (!isInside(event.target)) dismiss();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return boundaryRef;
}
