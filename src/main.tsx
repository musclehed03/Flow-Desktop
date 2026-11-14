import { hydrateDjSession } from "./lib/djSession";
import { SensoryRoot } from "./lib/useSensorySuite";
import React from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { TabRouter } from "./components/layout/TabRouter";
import { PipWindowApp } from "./components/pip/PipWindowApp";
import { DeviantTracer } from "./components/accessibility/DeviantTracer";
import { GlobalTooltip } from "./components/ui/GlobalTooltip";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { initAppLanguage } from "./lib/i18n/index";
import { installGlobalErrorHandlers } from "./lib/diagnostics";
import { PIP_WINDOW_LABEL } from "./lib/api/pip";

installGlobalErrorHandlers();
void hydrateDjSession();

// Some modules read strings as they load, so the language has to be in place before the app is imported.
void initAppLanguage().finally(() => {
  void import("./App").then(({ default: App }) => {
    // Both windows load the same bundle; the window label decides which root runs.
    // The pop-out player deliberately stays outside the router — it is one surface,
    // not an app, and mounting the full shell there would duplicate every global
    // controller the main window already owns.
    const isPopoutPlayerWindow = (() => {
      try {
        return getCurrentWindow().label === PIP_WINDOW_LABEL;
      } catch {
        return false;
      }
    })();

    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
      <React.StrictMode>
        <ErrorBoundary>
          {isPopoutPlayerWindow ? (
            <SensoryRoot><GlobalTooltip /><DeviantTracer /><PipWindowApp /></SensoryRoot>
          ) : (
            <TabRouter>
              <SensoryRoot><GlobalTooltip /><DeviantTracer /><App /></SensoryRoot>
            </TabRouter>
          )}
        </ErrorBoundary>
      </React.StrictMode>,
    );
  });
});
