import { useEffect, useMemo, useState } from "react";
import { Pencil, Play, Plus, Save, Trash2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { getString } from "../../lib/i18n/index";
import type { SmartPlaylistRule } from "../../lib/libraryIntelligence";
import {
  defaultSmartPlaylistRule,
  deleteSmartPlaylist,
  loadSmartPlaylistInputs,
  loadSmartPlaylists,
  previewSmartPlaylist,
  saveSmartPlaylist,
  type SavedSmartPlaylist,
  type SmartPlaylistInputs,
} from "../../lib/smartPlaylists";
import { useUiStore } from "../../store/useUiStore";
import { Button } from "../ui/Button";
import { ToggleSwitch } from "../ui/ToggleSwitch";

interface Draft {
  id?: string;
  playlistId?: string;
  name: string;
  rule: SmartPlaylistRule;
}

const emptyDraft = (): Draft => ({ name: "", rule: defaultSmartPlaylistRule() });
const numberOrUndefined = (value: string) => value === "" ? undefined : Number(value);

function NumberInput({ label, value, min, max, onChange }: { label: string; value?: number; min: number; max: number; onChange: (value?: number) => void }) {
  return <label className="space-y-1 text-sm"><span className="font-medium">{label}</span><input type="number" value={value ?? ""} min={min} max={max} onChange={(event) => onChange(numberOrUndefined(event.target.value))} className="w-full rounded-lg border-2 border-outline-variant bg-surface px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" /></label>;
}

export function SmartPlaylistEditor() {
  const navigate = useNavigate();
  const showToast = useUiStore((state) => state.showToast);
  const [saved, setSaved] = useState<SavedSmartPlaylist[]>([]);
  const [inputs, setInputs] = useState<SmartPlaylistInputs | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    const [rules, source] = await Promise.all([loadSmartPlaylists(), loadSmartPlaylistInputs()]);
    setSaved(rules); setInputs(source);
  };
  useEffect(() => { void reload(); }, []);
  const preview = useMemo(() => draft && inputs ? previewSmartPlaylist(inputs, draft.rule, () => .5) : [], [draft, inputs]);
  const patchRule = (patch: Partial<SmartPlaylistRule>) => setDraft((current) => current ? ({ ...current, rule: { ...current.rule, ...patch } }) : current);
  const edit = (item: SavedSmartPlaylist) => setDraft({ id: item.id, playlistId: item.playlistId, name: item.name, rule: { ...defaultSmartPlaylistRule(), ...item.rule } });

  return <section className="rounded-2xl border-2 border-outline-variant p-5" aria-labelledby="smart-playlists-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="smart-playlists-heading" className="text-xl font-semibold">{getString("smart_playlist_title")}</h2><p className="text-sm text-on-surface-variant">{getString("smart_playlist_editor_desc")}</p></div><Button onClick={() => setDraft(emptyDraft())}><Plus size={16} />{getString("smart_playlist_new")}</Button></div>
    {saved.length ? <ul className="mt-4 grid gap-2">{saved.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-outline-variant p-3"><span className="font-medium">{item.name}</span><span className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => navigate(`/playlist/${item.playlistId}`)}><Play size={15} />{getString("play")}</Button><Button size="sm" variant="secondary" onClick={() => edit(item)}><Pencil size={15} />{getString("edit")}</Button><Button size="sm" variant="ghost" onClick={async () => { await deleteSmartPlaylist(item.id); if (draft?.id === item.id) setDraft(null); await reload(); }}><Trash2 size={15} />{getString("delete")}</Button></span></li>)}</ul> : <p className="mt-4 text-sm text-on-surface-variant">{getString("smart_playlist_empty")}</p>}

    {draft ? <form className="mt-5 space-y-4 rounded-2xl border-2 border-outline-variant bg-surface-container-low p-4" onSubmit={async (event) => {
      event.preventDefault(); if (!inputs || saving) return; setSaving(true);
      try { const result = await saveSmartPlaylist(draft, inputs); showToast({ variant: "success", message: getString("smart_playlist_saved") }); await reload(); edit(result); }
      catch { showToast({ variant: "error", message: getString("smart_playlist_save_failed") }); }
      finally { setSaving(false); }
    }}>
      <div className="flex items-center justify-between"><h3 className="font-semibold">{getString(draft.id ? "smart_playlist_edit" : "smart_playlist_create")}</h3><button type="button" aria-label={getString("close")} onClick={() => setDraft(null)} className="rounded-full p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"><X size={17} /></button></div>
      <label className="block space-y-1 text-sm"><span className="font-medium">{getString("smart_playlist_name")}</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} className="w-full rounded-lg border-2 border-outline-variant bg-surface px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" /></label>
      <div className="grid gap-3 md:grid-cols-2"><label className="space-y-1 text-sm"><span className="font-medium">{getString("smart_playlist_artist")}</span><input value={draft.rule.artistContains ?? ""} onChange={(event) => patchRule({ artistContains: event.target.value })} className="w-full rounded-lg border-2 border-outline-variant bg-surface px-3 py-2" /></label><label className="space-y-1 text-sm"><span className="font-medium">{getString("smart_playlist_genre")}</span><input value={draft.rule.genre ?? ""} onChange={(event) => patchRule({ genre: event.target.value })} className="w-full rounded-lg border-2 border-outline-variant bg-surface px-3 py-2" /></label>
        <NumberInput label={getString("smart_playlist_year_from")} value={draft.rule.yearFrom} min={1900} max={2100} onChange={(yearFrom) => patchRule({ yearFrom })} /><NumberInput label={getString("smart_playlist_year_to")} value={draft.rule.yearTo} min={1900} max={2100} onChange={(yearTo) => patchRule({ yearTo })} />
        <NumberInput label={getString("smart_playlist_min_plays")} value={draft.rule.minPlayCount} min={0} max={100000} onChange={(minPlayCount) => patchRule({ minPlayCount })} /><NumberInput label={getString("smart_playlist_not_played_days")} value={draft.rule.notPlayedSinceDays} min={1} max={36500} onChange={(notPlayedSinceDays) => patchRule({ notPlayedSinceDays })} />
        <NumberInput label={getString("smart_playlist_limit")} value={draft.rule.limit} min={1} max={10000} onChange={(limit) => patchRule({ limit: limit ?? 100 })} />
      </div>
      <div className="flex flex-wrap gap-6"><label className="flex items-center gap-2"><ToggleSwitch checked={draft.rule.likedOnly ?? false} onChange={(likedOnly) => patchRule({ likedOnly })} label={getString("smart_playlist_liked_only")} /><span>{getString("smart_playlist_liked_only")}</span></label><label className="flex items-center gap-2"><ToggleSwitch checked={draft.rule.random} onChange={(random) => patchRule({ random })} label={getString("smart_playlist_random")} /><span>{getString("smart_playlist_random")}</span></label></div>
      <div aria-live="polite"><h4 className="font-semibold">{getString("smart_playlist_preview", preview.length)}</h4><ol className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">{preview.slice(0, 50).map((track) => <li key={track.id} className="flex justify-between gap-3"><span className="truncate">{track.title}</span><span className="truncate text-on-surface-variant">{track.artistName ?? track.channelName}</span></li>)}</ol></div>
      <Button type="submit" disabled={saving || !draft.name.trim()}><Save size={16} />{saving ? getString("saving") : getString("save")}</Button>
    </form> : null}
  </section>;
}
