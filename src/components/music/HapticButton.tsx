import type { ButtonHTMLAttributes, Ref } from "react";

/*
  The transport buttons' press feedback, same as the shared Button: pure CSS
  (.press-positive in App.css), no framer-motion spring per tap (fixes batch #10).
  A disabled HapticButton gets the no-action nudge instead of the squash.
*/

export type HapticButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>;
};

export function HapticButton({ children, type = "button", disabled, className = "", ref, ...props }: HapticButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      ref={ref}
      className={`${disabled ? "press-noop" : "press-positive"} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
