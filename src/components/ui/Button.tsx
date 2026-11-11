import type { ButtonHTMLAttributes } from "react";

/*
  Press feedback is pure CSS now (see .press-positive/.press-negative/.press-noop
  in App.css): the same squash the player's transport buttons use, so a click feels
  identical wherever it happens — positive presses land light, destructive presses
  land heavier with a deeper red, and a disabled press nudges side to side instead
  of feeling dead. No framer-motion spring per tap (fixes batch #10).
*/

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "ref"> {
  variant?: "primary" | "secondary" | "tonal" | "outline" | "ghost" | "destructive";
  size?: "sm" | "md" | "lg";
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  // Disabled keeps pointer events (no pointer-events-none) so the no-action nudge
  // can show; the disabled attribute still blocks the click itself.
  const press = disabled ? "press-noop" : variant === "destructive" ? "press-negative" : "press-positive";
  const baseStyles =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium focus:outline-none disabled:opacity-50";

  const variants = {
    primary: "bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:opacity-90",
    secondary: "bg-surface-container-high text-chrome-neutral-200 hover:bg-surface-container-highest",
    tonal: "bg-surface-container-high text-chrome-neutral-200 hover:bg-surface-container-highest",
    outline: "bg-transparent text-chrome-neutral-200 border border-chrome-neutral-800 hover:bg-surface-container-high",
    ghost: "bg-transparent text-chrome-neutral-200 hover:bg-surface-container-high",
    destructive:
      "bg-chrome-red-950/30 text-chrome-red-400 border border-chrome-red-900/50 hover:bg-chrome-red-950/50 active:bg-chrome-red-950/70",
  };

  const sizes = {
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${press} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
