import { AnimatePresence, motion } from "framer-motion";
import { Download, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { useDismissOnOutsideInteraction } from "../../lib/useDismissOnOutsideInteraction";

import { EqLimits } from "../../lib/audio/eq/models";
import { withBassBoost } from "../../lib/audio/eq/stateOps";
import { pickEqPreset, restoreCustomEq, useEqualizer, useMusicEqAvailable } from "../../lib/audio/eq/useEqualizer";
import type { AudioProcessingConfig } from "../../lib/audio/eqConfig";
import { currentOutputDevice, parseOutputDeviceProfiles } from "../../lib/audio/outputDeviceProfiles";
import { getString, type StringKey } from "../../lib/i18n/index";
import { SETTINGS } from "../../lib/settings/schema";
import { getSettingValue, setSettingValue } from "../../store/useAppSettingsStore";
import { useMusicPlayerStore } from "../../store/useMusicPlayerStore";
import { useEqStore } from "../../store/useEqStore";
import { useBoolPref } from "../../lib/usePreference";
import { useUiStore } from "../../store/useUiStore";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import { EqInputModeSelector, EqValueControl } from "./eq/EqValueControl";
import { EqResponseGraph } from "./eq/EqResponseGraph";
import { MusicAudioOptions } from "./MusicAudioOptions";

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, Number.isFinite(value) ? value : low));

/** A labelled control with its plain-language explainer, for the fast custom tooltip. */
function explain(key: StringKey, children: ReactNode) {
  return (
    <label className="block" data-tooltip-detail={getString(`${key}_desc` as StringKey)}>
      <span className="text-sm font-medium text-chrome-neutral-200">{getString(key)}</span>
      {children}
      {/* Visible here, and read aloud by the control via aria-describedby="{key}-desc". */}
      <span id={`${key}-desc`} className="mt-1 block text-xs text-chrome-neutral-500">
        {getString(`${key}_desc` as StringKey)}
      </span>
    </label>
  );
}

/**
 * The quick audio panel: the equalizer's switch, curve, presets and bass boost with Edit for the
 * rest, then the other music audio settings — plus the Deviants dynamics stage (preamp, balance,
 * compressor, limiter), the per-device profile save, and the playback tools. The EQ curve itself
 * lives in the upstream engine (EqChain + useEqStore); the dynamics half lives in the
 * AudioProcessingConfig the engine applies after the EQ chain.
 */
export function EqPanel({
  open,
  onClose,
  placement = "top",
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  placement?: "top" | "bottom";
  /** The button that opens the panel: clicks on it toggle, never dismiss-then-reopen. */
  triggerRef?: RefObject<HTMLElement | null>;
}) {
  const eq = useEqualizer();
  const available = useMusicEqAvailable();
  const update = useEqStore((s) => s.update);
  const setEditorOpen = useEqStore((s) => s.setEditorOpen);

  const processing = useMusicPlayerStore((s) => s.audioProcessing);
  const setProcessing = useMusicPlayerStore((s) => s.setAudioProcessing);
  const dynamics = processing.dynamics;
  const updateDynamics = (patch: Partial<AudioProcessingConfig["dynamics"]>) =>
    setProcessing({ ...processing, dynamics: { ...processing.dynamics, ...patch } });

  const [stableVolume, setStableVolume] = useBoolPref(SETTINGS.STABLE_VOLUME_ENABLED, false);
  const [skipSilence, setSkipSilence] = useBoolPref(SETTINGS.SKIP_SILENCE_ENABLED, false);
  const [volumeBoost, setVolumeBoost] = useBoolPref(SETTINGS.ALLOW_VOLUME_BOOST, false);

  const saveDevice = async () => {
    const profiles = parseOutputDeviceProfiles(getSettingValue(SETTINGS.MUSIC_OUTPUT_PROFILES));
    const output = await currentOutputDevice(profiles.salt).catch(() => null);
    if (!output) {
      useUiStore.getState().showToast({ message: getString("eq_device_unavailable"), variant: "error" });
      return;
    }
    const next = [...profiles.profiles];
    const index = next.findIndex((profile) => profile.deviceKey === output.key);
    const profile = { deviceKey: output.key, label: output.label, config: processing };
    if (index >= 0) next[index] = profile;
    else next.push(profile);
    await setSettingValue(SETTINGS.MUSIC_OUTPUT_PROFILES, JSON.stringify({ ...profiles, activeDeviceKey: output.key, profiles: next }));
    useUiStore.getState().showToast({ message: getString("eq_device_saved", output.label), variant: "success" });
  };

  // Click-off dismiss (fixes batch #18): a click or focus move outside the
  // panel — back to the library, the queue, anywhere — closes it, so the X is
  // never the only way out. The toggle that opened it is exempt, or its click
  // would close the panel and immediately open it again.
  const panelRef = useDismissOnOutsideInteraction<HTMLDivElement>({
    open,
    onDismiss: onClose,
    additionalRefs: triggerRef ? [triggerRef] : [],
    restoreFocusRef: triggerRef,
  });

  const fromY = placement === "top" ? 10 : -10;
  const selectedId = eq.active.presetId;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          key="eq-panel"
          initial={{ opacity: 0, y: fromY, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: fromY, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 420, damping: 34, mass: 0.8 }}
          style={{ transformOrigin: placement === "top" ? "bottom right" : "top right" }}
          className="max-h-[min(85vh,720px)] w-80 overflow-y-auto rounded-2xl border border-chrome-neutral-800 bg-surface-container p-4"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-widest text-chrome-neutral-500">
              {getString("music_equalizer")}
            </span>
            <div className="flex items-center gap-2">
              <ToggleSwitch
                checked={eq.state.enabled}
                onChange={(enabled) => update((s) => ({ ...s, enabled }))}
              />
              <button
                type="button"
                onClick={onClose}
                aria-label={getString("music_collapse")}
                className="grid h-7 w-7 place-items-center rounded-full text-chrome-neutral-400 transition-colors duration-200 ease-out hover:bg-surface-container-high hover:text-chrome-neutral-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!available && (
            <p className="mb-3 rounded-lg border border-chrome-neutral-800 px-3 py-2 text-xs text-chrome-neutral-400">
              {getString("eq_unavailable")}
            </p>
          )}

          <div className={`flex flex-col gap-3 transition-opacity duration-200 ${eq.state.enabled ? "" : "opacity-40"}`}>
            <div className="rounded-lg border border-chrome-neutral-800 bg-surface-container-low">
              <EqResponseGraph bands={eq.drawnBands} height={64} rangeDb={15} ariaLabel={getString("eq_graph_label")} />
            </div>

            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto hide-scrollbar">
              {eq.hasCustom && (
                <Chip
                  active={selectedId === null}
                  onClick={() => restoreCustomEq(eq.state.mode)}
                  className="h-7 px-2.5 text-xs"
                >
                  {getString("eq_preset_custom")}
                </Chip>
              )}
              {eq.presets.map((preset) => (
                <Chip
                  key={preset.id}
                  active={preset.id === selectedId}
                  onClick={() => pickEqPreset(preset.id)}
                  className="h-7 px-2.5 text-xs"
                >
                  {preset.name}
                </Chip>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-chrome-neutral-200">{getString("eq_bass_boost")}</span>
              <EqValueControl
                value={eq.state.bassBoost}
                min={0}
                max={EqLimits.MAX_BASS_BOOST}
                step={0.5}
                decimals={2}
                unit={getString("eq_unit_db")}
                ariaLabel={getString("eq_bass_boost")}
                ariaDescribedBy="eq_bass_boost-desc"
                className="flex-1"
                onCommit={(db) => update((s) => withBassBoost(s, db))}
              />
            </div>
            <p id="eq_bass_boost-desc" className="text-xs text-chrome-neutral-500">
              {getString("eq_bass_boost_desc")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              setEditorOpen(true);
            }}
            className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-surface-container-high px-3 py-2 text-sm text-chrome-neutral-200 transition-colors duration-200 ease-out hover:bg-surface-container-highest"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {getString("eq_edit")}
          </button>

          {/* Deviants dynamics stage: preamp, balance, compressor and limiter, applied by the */}
          {/* engine after the EQ chain. Kept in the quick panel so it stays one tap away. */}
          <section className="mt-4 space-y-4 border-t border-chrome-neutral-800 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-chrome-neutral-500">
              {getString("eq_dynamics")}
            </h3>
            <EqInputModeSelector />
            {explain(
              "eq_preamp",
              <div className="mt-2">
                <EqValueControl
                  value={dynamics.preampDb}
                  min={-15}
                  max={15}
                  step={0.1}
                  decimals={2}
                  unit="dB"
                  ariaLabel={getString("eq_preamp")}
                  ariaDescribedBy="eq_preamp-desc"
                  onCommit={(preampDb) => updateDynamics({ preampDb: clamp(preampDb, -15, 15) })}
                />
              </div>,
            )}
            {explain(
              "eq_balance",
              <div className="mt-2">
                <EqValueControl
                  value={dynamics.balance}
                  min={-1}
                  max={1}
                  step={0.01}
                  decimals={2}
                  ariaLabel={getString("eq_balance")}
                  ariaDescribedBy="eq_balance-desc"
                  onCommit={(balance) => updateDynamics({ balance: clamp(balance, -1, 1) })}
                />
              </div>,
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-sm text-chrome-neutral-200">{getString("eq_compressor")}</span>
                <p id="eq_compressor-desc" className="text-xs text-chrome-neutral-500">{getString("eq_compressor_desc")}</p>
              </div>
              <ToggleSwitch
                checked={dynamics.compressorEnabled}
                onChange={(compressorEnabled) => updateDynamics({ compressorEnabled })}
                label={getString("eq_compressor")}
                ariaDescribedBy="eq_compressor-desc"
              />
            </div>
            {dynamics.compressorEnabled && (
              <div className="grid grid-cols-2 gap-3">
                {explain(
                  "eq_threshold",
                  <div className="mt-2">
                    <EqValueControl
                      value={dynamics.compressorThreshold}
                      min={-60}
                      max={0}
                      step={1}
                      decimals={0}
                      unit="dB"
                      ariaLabel={getString("eq_threshold")}
                  ariaDescribedBy="eq_threshold-desc"
                      onCommit={(compressorThreshold) => updateDynamics({ compressorThreshold: clamp(compressorThreshold, -60, 0) })}
                    />
                  </div>,
                )}
                {explain(
                  "eq_ratio",
                  <div className="mt-2">
                    <EqValueControl
                      value={dynamics.compressorRatio}
                      min={1}
                      max={20}
                      step={0.5}
                      decimals={1}
                      ariaLabel={getString("eq_ratio")}
                  ariaDescribedBy="eq_ratio-desc"
                      onCommit={(compressorRatio) => updateDynamics({ compressorRatio: clamp(compressorRatio, 1, 20) })}
                    />
                  </div>,
                )}
                {explain(
                  "eq_attack",
                  <div className="mt-2">
                    <EqValueControl
                      value={dynamics.compressorAttack}
                      min={0}
                      max={1}
                      step={0.01}
                      decimals={3}
                      unit="s"
                      ariaLabel={getString("eq_attack")}
                  ariaDescribedBy="eq_attack-desc"
                      onCommit={(compressorAttack) => updateDynamics({ compressorAttack: clamp(compressorAttack, 0, 1) })}
                    />
                  </div>,
                )}
                {explain(
                  "eq_release",
                  <div className="mt-2">
                    <EqValueControl
                      value={dynamics.compressorRelease}
                      min={0.01}
                      max={1}
                      step={0.01}
                      decimals={2}
                      unit="s"
                      ariaLabel={getString("eq_release")}
                  ariaDescribedBy="eq_release-desc"
                      onCommit={(compressorRelease) => updateDynamics({ compressorRelease: clamp(compressorRelease, 0.01, 1) })}
                    />
                  </div>,
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <span className="text-sm text-chrome-neutral-200">{getString("eq_limiter")}</span>
                <p id="eq_limiter-desc" className="text-xs text-chrome-neutral-500">{getString("eq_limiter_desc")}</p>
              </div>
              <ToggleSwitch
                checked={dynamics.limiterEnabled}
                onChange={(limiterEnabled) => updateDynamics({ limiterEnabled })}
                label={getString("eq_limiter")}
                ariaDescribedBy="eq_limiter-desc"
              />
            </div>
          </section>

          {/* Deviants playback tools: stable volume, skip silence and volume boost. */}
          <section className="mt-4 space-y-3 border-t border-chrome-neutral-800 pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-chrome-neutral-500">
              {getString("eq_playback_tools")}
            </h3>
            {([
              ["settings_stable_volume", stableVolume, setStableVolume],
              ["settings_skip_silence", skipSilence, setSkipSilence],
              ["settings_volume_boost", volumeBoost, setVolumeBoost],
            ] as const).map(([key, checked, setter]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-sm text-chrome-neutral-200">{getString(key)}</span>
                  <p className="text-xs text-chrome-neutral-500">{getString(`${key}_desc` as StringKey)}</p>
                </div>
                <ToggleSwitch checked={checked} onChange={setter} label={getString(key)} />
              </div>
            ))}
          </section>

          {/* Deviants per-device profile: saves this processing config for the output now playing, */}
          {/* and the player switches to it whenever that output returns. */}
          <div className="mt-4 border-t border-chrome-neutral-800 pt-3">
            <Button variant="secondary" onClick={() => void saveDevice()}>
              <Download size={15} />
              {getString("eq_save_device")}
            </Button>
            <p className="mt-1 text-xs text-chrome-neutral-500">{getString("eq_device_desc")}</p>
          </div>

          <div className="mt-4 border-t border-chrome-neutral-800 pt-3">
            <MusicAudioOptions />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default EqPanel;
