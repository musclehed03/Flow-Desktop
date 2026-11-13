import { Logo } from "./Logo";

// Startup splash: the DDT flicker intro, centered, while the app boots.
// Under Safe Motion the Logo renders its final frame statically — no flicker.
export function SplashIntro() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Logo size={96} intro />
    </div>
  );
}
