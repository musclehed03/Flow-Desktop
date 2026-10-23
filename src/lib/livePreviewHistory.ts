import { useCallback, useRef, useState } from "react";

export interface LivePreviewHistory<T> {
  baseline: T;
  current: T;
  past: T[];
}

export function createLivePreviewHistory<T>(initial: T): LivePreviewHistory<T> {
  return { baseline: structuredClone(initial), current: structuredClone(initial), past: [] };
}

function equivalent<T>(left: T, right: T) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function applyLivePreview<T>(state: LivePreviewHistory<T>, next: T): LivePreviewHistory<T> {
  if (equivalent(state.current, next)) return state;
  return { ...state, current: next, past: [...state.past.slice(-49), state.current] };
}

export function undoLivePreview<T>(state: LivePreviewHistory<T>): LivePreviewHistory<T> {
  const previous = state.past[state.past.length - 1];
  return previous === undefined ? state : { ...state, current: previous, past: state.past.slice(0, -1) };
}

export function resetLivePreview<T>(state: LivePreviewHistory<T>): LivePreviewHistory<T> {
  if (equivalent(state.current, state.baseline)) return state;
  return { ...state, current: structuredClone(state.baseline), past: [...state.past.slice(-49), state.current] };
}

export function useLivePreviewHistory<T>(initial: T, onChange: (value: T) => void) {
  const [state, setState] = useState(() => createLivePreviewHistory(initial));
  const stateRef = useRef(state);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commit = useCallback((next: LivePreviewHistory<T>) => {
    stateRef.current = next;
    setState(next);
    onChangeRef.current(next.current);
  }, []);
  const apply = useCallback((value: T) => commit(applyLivePreview(stateRef.current, value)), [commit]);
  const undo = useCallback(() => commit(undoLivePreview(stateRef.current)), [commit]);
  const reset = useCallback(() => commit(resetLivePreview(stateRef.current)), [commit]);
  return { value: state.current, apply, undo, reset, canUndo: state.past.length > 0 };
}
