import { cloneElement, isValidElement, useRef, type MouseEvent, type ReactNode } from 'react';
import { ToggleSwitch, type ToggleSwitchProps } from '../ui/ToggleSwitch';

export interface SettingItemProps {
  title: string;
  description?: string;
  disabled?: boolean;
  /** Optional leading glyph, for lists where the rows need to be scannable. */
  icon?: ReactNode;
  children: ReactNode;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function SettingItem({ title, description, disabled = false, icon, children }: SettingItemProps) {
  const controlRef = useRef<HTMLDivElement>(null);

  // The whole bar manages the setting (fixes batch #20): a click anywhere on
  // the row — name, description, empty space — activates its control, so the
  // little handle on the far right is never the only way in. Clicks that
  // land on a control already do their own thing and are left alone, and a
  // text-selection drag is not a tap on the row.
  const activate = (event: MouseEvent) => {
    if (disabled) return;
    if (window.getSelection()?.toString()) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, input, select, textarea, a, [role="switch"], [role="combobox"], [contenteditable]')) return;
    const root = controlRef.current;
    if (!root) return;
    const primary =
      root.querySelector<HTMLElement>('button[role="switch"]:not(:disabled)') ??
      root.querySelector<HTMLElement>('button:not(:disabled)') ??
      root.querySelector<HTMLElement>('input[type="text"]:not(:disabled), input[type="number"]:not(:disabled)') ??
      root.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!primary) return;
    if (primary instanceof HTMLInputElement && (primary.type === 'text' || primary.type === 'number')) {
      primary.focus();
      primary.select();
    } else if (primary instanceof HTMLButtonElement) {
      primary.click();
    } else {
      primary.focus();
    }
  };

  return (
    <div
      aria-disabled={disabled}
      data-tooltip-detail={description || undefined}
      onClick={activate}
      className={cx(
        'flex justify-between items-center px-5 py-4 transition-colors duration-200 ease-out',
        disabled ? 'opacity-50' : 'cursor-pointer hover:bg-surface-container'
      )}
    >
      {icon && <span className="mr-3 shrink-0 text-chrome-neutral-400">{icon}</span>}
      <div className="flex-1 min-w-0 mr-4">
        <div className="text-sm font-medium text-chrome-neutral-200">{title}</div>
        {description && (
          <div className="text-xs text-chrome-neutral-400 mt-0.5">{description}</div>
        )}
      </div>
      <div ref={controlRef} className="shrink-0">{isValidElement<ToggleSwitchProps>(children) && children.type === ToggleSwitch
        ? cloneElement(children, { label: children.props.label ?? title }) : children}</div>
    </div>
  );
}
