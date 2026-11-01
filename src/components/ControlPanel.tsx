"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useNews } from "@/lib/news-context";
import { useToast } from "@/components/toast";
import { fetchSettingsPayload, saveSettings } from "@/lib/api";
import { formatDuration, timeAgo } from "@/lib/time";
import type { Region, Settings, SettingsPayload, SourceDef } from "@/lib/types";
import { ProgressRing } from "./ProgressRing";
import { CheckIcon, CloseIcon, SyncIcon, XIcon } from "./icons";
import { PersianMark } from "./LionSunFlag";

const WINDOW_OPTIONS = [6, 12, 24, 48];
const INTERVAL_OPTIONS = [0, 15, 30, 60, 180, 360, 720];
const EASE = [0.22, 1, 0.36, 1] as const;

function intervalLabel(min: number) {
  if (min === 0) return "Off";
  if (min < 60) return `${min}m`;
  return `${min / 60}h`;
}

export default function ControlPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, refreshing, progress, liveResults, lastDone, refreshAndNotify, now } = useNews();
  const toast = useToast();

  const [payload, setPayload] = useState<SettingsPayload | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || payload) return;
    fetchSettingsPayload()
      .then((p) => {
        setPayload(p);
        setSaved(p.settings);
        setDraft(p.settings);
      })
      .catch(() => toast("Failed to load settings", "error"));
  }, [open, payload, toast]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => closeRef.current?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      returnFocusRef.current?.focus();
    };
  }, [open, onClose]);

  const dirty = useMemo(() => Boolean(saved && draft && JSON.stringify(draft) !== JSON.stringify(saved)), [saved, draft]);

  const registryByRegion = useMemo(() => {
    const groups: { region: Region; label: string; sources: SourceDef[] }[] = [
      { region: "global", label: "Global sources", sources: [] },
      { region: "persian-diaspora", label: "Persian sources", sources: [] },
      { region: "iran", label: "Iran sources", sources: [] },
    ];
    for (const s of payload?.registry ?? []) groups.find((g) => g.region === s.region)?.sources.push(s);
    return groups;
  }, [payload]);

  const enabledCount = useMemo(() => (draft ? Object.values(draft.sources).filter((s) => s.enabled).length : 0), [draft]);

  const nextSyncAt = useMemo(() => {
    if (!data || !saved?.autoRefreshMinutes) return null;
    return Date.parse(data.generatedAt) + saved.autoRefreshMinutes * 60_000;
  }, [data, saved]);

  const save = useCallback(async () => {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const settings = await saveSettings(draft);
      setSaved(settings);
      setDraft(settings);
      setJustSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 1600);
      toast("Settings saved", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }, [draft, saving, toast]);

  const resetDefaults = useCallback(() => {
    if (!payload) return;
    setDraft({
      windowHours: 12,
      autoRefreshMinutes: 180,
      maxItems: 240,
      sources: Object.fromEntries(payload.registry.map((s) => [s.id, { enabled: true }])),
    });
  }, [payload]);

  const ratio = progress.total > 0 ? progress.done / progress.total : undefined;
  const syncPercent = ratio === undefined ? null : Math.round(ratio * 100);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="control-backdrop fixed inset-0 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            onClick={onClose}
          />
          <motion.aside
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="control-panel-title"
            className="control-panel fixed right-0 top-0 z-40 flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="control-panel__header">
              <div>
                <h2 id="control-panel-title" className="control-panel__title">Desk controls</h2>
                <p className="control-panel__subtitle">Tune the pulse of your local wire</p>
              </div>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close panel" className="btn-icon">
                <CloseIcon />
              </button>
            </div>

            <div className="control-panel__body">
              <section className="control-stats">
                <Stat label="Last sync" value={data ? timeAgo(data.generatedAt, now) : "—"} />
                <Stat
                  label="Next auto-sync"
                  value={saved?.autoRefreshMinutes ? (nextSyncAt ? (nextSyncAt > now ? formatDuration(nextSyncAt - now) : "due now") : "—") : "off"}
                />
                <Stat label="Stories" value={data ? String(data.itemCount) : "—"} />
                <Stat label="Window" value={`${saved?.windowHours ?? data?.windowHours ?? 12}h`} />
              </section>

              <section className={`control-sync ${refreshing ? "control-sync--active" : ""}`}>
                <div className="control-sync__glow" aria-hidden />
                <div className="control-sync__top">
                  <p className="control-sync__eyebrow">
                    <span className="control-sync__beacon" aria-hidden />
                    Wire refresh
                  </p>
                  <span className="control-sync__state">{refreshing ? "In progress" : "Ready"}</span>
                </div>

                <motion.button
                  whileHover={refreshing ? {} : { y: -2 }}
                  whileTap={refreshing ? {} : { scale: 0.985 }}
                  onClick={() => void refreshAndNotify()}
                  disabled={refreshing}
                  aria-label="Sync news now"
                  className="control-sync__action disabled:cursor-wait"
                >
                  <span className="control-sync__dial" aria-hidden>
                    {refreshing && (
                      <motion.span
                        className="control-sync__pulse"
                        animate={{ scale: [1, 1.28], opacity: [0.65, 0] }}
                        transition={{ repeat: Infinity, duration: 1.45, ease: EASE }}
                      />
                    )}
                    <ProgressRing size={34} stroke={2.5} progress={ratio} spinning={refreshing && ratio === undefined} className="control-sync__ring" />
                    <SyncIcon size={16} className={refreshing ? "sync-icon--spinning" : ""} />
                  </span>
                  <span className="control-sync__copy">
                    <strong>{refreshing ? (progress.total ? `Scanning ${progress.done} of ${progress.total} sources` : "Contacting your sources") : "Sync the wire"}</strong>
                    <span>
                      {refreshing
                        ? syncPercent === null ? "Establishing the live feed..." : `${syncPercent}% complete - fresh results will appear here.`
                        : lastDone
                          ? `${lastDone.itemCount} stories found in ${(lastDone.ms / 1000).toFixed(1)} seconds.`
                          : "Fetch every enabled source and rebuild the latest briefing."}
                    </span>
                  </span>
                  <span className="control-sync__trigger">{refreshing ? (syncPercent === null ? "..." : `${syncPercent}%`) : "Run"}</span>
                </motion.button>

                <div className="control-sync__facts" aria-label="Sync details">
                  <div>
                    <span>Listening to</span>
                    <strong>{enabledCount || "—"} sources</strong>
                  </div>
                  <div>
                    <span>Last pulse</span>
                    <strong>{data ? timeAgo(data.generatedAt, now) : "Not yet synced"}</strong>
                  </div>
                </div>

                {(refreshing || liveResults.length > 0) && (
                  <div className="control-sync__results" aria-live="polite">
                    <AnimatePresence initial={false}>
                      {liveResults.map((s) => (
                        <motion.div
                          key={s.id}
                          initial={{ opacity: 0, x: 18 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.24, ease: EASE }}
                        className="control-live-result flex items-center gap-2"
                        >
                          <span aria-hidden>{s.flag}</span>
                          <span dir="auto" className="truncate font-medium">{s.name}</span>
                          {s.ok ? (
                            <span className="control-live-result__status control-live-result__status--ok ml-auto shrink-0">
                              <AnimatedCheck /> {s.count} · {s.ms}ms
                            </span>
                          ) : (
                            <span className="control-live-result__status control-live-result__status--bad ml-auto shrink-0" title={s.error}>
                              <XIcon /> offline
                            </span>
                          )}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {refreshing && liveResults.length === 0 && <p className="control-sync__waiting">Waiting for the first response...</p>}
                  </div>
                )}
              </section>

              <section className="control-panel__settings">
                <div className="setting-section__header">
                  <h3 className="control-panel__section-title">Update system</h3>
                  {dirty && (
                    <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.18, ease: EASE }} className="control-status">
                      <span className="control-status__dot" /> unsaved changes
                    </motion.span>
                  )}
                </div>

                <SettingRow label="Time window" hint="Only stories newer than this are kept">
                  <Segmented
                    id="window"
                    options={WINDOW_OPTIONS}
                    value={draft?.windowHours ?? 12}
                    onChange={(v) => setDraft((d) => d && { ...d, windowHours: v })}
                    format={(v) => `${v}h`}
                  />
                </SettingRow>

                <SettingRow label="Auto-sync" hint="Background refresh while the server runs">
                  <Segmented
                    id="interval"
                    options={INTERVAL_OPTIONS}
                    value={draft?.autoRefreshMinutes ?? 180}
                    onChange={(v) => setDraft((d) => d && { ...d, autoRefreshMinutes: v })}
                    format={intervalLabel}
                  />
                </SettingRow>

                <SettingRow label="Sources" hint={`${enabledCount}/${payload?.registry.length ?? 0} enabled`}>
                  <div className="control-source-list">
                    {!payload && <p className="control-source-loading">Loading…</p>}
                    {registryByRegion.map((group) => (
                      <div key={group.region}>
                        <p className="control-source-group-title">
                          {group.region === "persian-diaspora" ? <PersianMark size={13}>{group.label}</PersianMark> : group.label}
                        </p>
                        <ul>
                          {group.sources.map((s) => {
                            const checked = draft?.sources[s.id]?.enabled ?? true;
                            return (
                              <li key={s.id} className="source-setting">
                                <span aria-hidden>{s.flag}</span>
                                <span dir="auto" className={`source-setting__name ${checked ? "" : "is-disabled"}`}>{s.name}</span>
                                <span className="source-setting__country">{s.country}</span>
                                <span className="ml-auto">
                                  <Switch
                                    checked={checked}
                                    label={`Toggle ${s.name}`}
                                    onChange={(v) =>
                                      setDraft((d) => d && { ...d, sources: { ...d.sources, [s.id]: { enabled: v } } })
                                    }
                                  />
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ))}
                  </div>
                </SettingRow>

                <div className="control-actions">
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => void save()}
                    disabled={!dirty || saving || !draft}
                    className="btn control-primary flex-1 disabled:opacity-50"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {justSaved ? (
                        <motion.span key="saved" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: EASE }} className="flex items-center gap-1.5">
                          <CheckIcon /> Saved
                        </motion.span>
                      ) : (
                        <motion.span key="save" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: EASE }}>
                          {saving ? "Saving…" : "Save settings"}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.97 }} onClick={resetDefaults} disabled={!payload || saving} className="btn disabled:opacity-50">
                    Reset
                  </motion.button>
                </div>
                <p className="control-panel__note">
                  Settings apply from the next sync and persist in <code>data/settings.json</code>. The build step and the
                  scheduler honor the same file.
                </p>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="control-stat">
      <p className="control-stat__label">{label}</p>
      <p className="control-stat__value">{value}</p>
    </div>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-row__header">
        <p className="setting-row__label">{label}</p>
        {hint && <span className="setting-row__hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends number>({
  id,
  options,
  value,
  onChange,
  format,
}: {
  id: string;
  options: T[];
  value: T;
  onChange: (v: T) => void;
  format: (v: T) => string;
}) {
  return (
    <div className="control-segmented" role="radiogroup" aria-label={id}>
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option)}
            className={`control-segmented__option ${active ? "is-active" : ""}`}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="control-segmented__indicator"
                transition={{ type: "spring", stiffness: 450, damping: 34 }}
              />
            )}
            <span className="relative z-10">{format(option)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
        className={`control-switch ${checked ? "is-checked" : ""}`}
    >
      <motion.span
        className="control-switch__thumb"
        animate={{ x: checked ? "var(--switch-travel)" : 0 }}
        transition={{ type: "spring", stiffness: 550, damping: 33 }}
      />
    </button>
  );
}

function AnimatedCheck() {
  return (
    <motion.svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <motion.path
        d="M2.5 8.5 6 12l7.5-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: EASE }}
      />
    </motion.svg>
  );
}
