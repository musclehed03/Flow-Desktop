import type { ReactNode } from "react";

export function VisualizerControl({ label, description, children, className = "" }: {
  label: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return <div className={className} data-tooltip-detail={description}>
    <div className="text-sm font-semibold text-on-surface">{label}</div>
    <div className="mt-2">{children}</div>
    <p className="mt-1 text-xs leading-5 text-on-surface-variant">{description}</p>
  </div>;
}

export const visualizerSelectClass = "block h-10 w-full rounded-lg border-2 border-outline-variant bg-surface px-3 text-on-surface";
export const visualizerInputClass = "block h-10 w-full rounded-lg border-2 border-outline-variant bg-surface px-3 text-on-surface";
