"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Header from "@/components/Header";
import NewsCard from "@/components/NewsCard";
import ControlPanel from "@/components/ControlPanel";
import { RegionSelect } from "@/components/RegionSelect";
import { useNews } from "@/lib/news-context";
import type { Region } from "@/lib/types";
import { GlobeIcon, SearchIcon } from "@/components/icons";

const PAGE_SIZE = 30;

export default function Home() {
  const { data, status, now, refreshing, load } = useNews();
  const [tab, setTab] = useState<Region>("global");
  const [query, setQuery] = useState("");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const openConsole = useCallback(() => setConsoleOpen(true), []);
  const closeConsole = useCallback(() => setConsoleOpen(false), []);

  useEffect(() => setLimit(PAGE_SIZE), [tab, query]);

  useEffect(() => {
    document.documentElement.classList.add("motion-ready");
    return () => document.documentElement.classList.remove("motion-ready");
  }, []);

  const cutoff = now - (data?.windowHours ?? 12) * 3_600_000;
  const fresh = useMemo(() => (data?.items ?? []).filter((item) => Date.parse(item.publishedAt) >= cutoff), [data, cutoff]);
  const inTab = useMemo(() => fresh.filter((item) => item.region === tab), [fresh, tab]);
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return inTab.filter((item) => !term || `${item.title} ${item.summary} ${item.sourceName}`.toLowerCase().includes(term));
  }, [inTab, query]);
  const counts = useMemo(() => ({
    global: fresh.filter((item) => item.region === "global").length,
    "persian-diaspora": fresh.filter((item) => item.region === "persian-diaspora").length,
    iran: fresh.filter((item) => item.region === "iran").length,
  }), [fresh]);
  const shown = visible.slice(0, limit);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header onOpenConsole={openConsole} />
      <main id="main-content" className="app-shell flex-1">
        <section className="desk-bar page-enter page-enter-2" aria-label="News desk controls">
          <RegionSelect tab={tab} onChange={setTab} counts={counts} />
          <label className="search-shell">
            <SearchIcon size={14} />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the desk" aria-label="Search headlines" className="search-field" />
            {query ? <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setQuery("")}>x</button> : null}
          </label>
        </section>

        <section className="workspace" aria-live="polite">
          {status === "ready" && data ? (
            <p className="feed-status page-enter page-enter-3">
              <strong>{refreshing ? "SYNCING" : "LIVE FEED"}</strong>
              <span className="feed-status__dot">/</span>
              <span>{visible.length} of {inTab.length} dispatches</span>
              <span className="feed-status__dot">/</span>
              <span>window {data.windowHours}h</span>
              <span className="feed-status__dot">/</span>
              <span>no trackers, no images</span>
            </p>
          ) : null}
          {status === "loading" && <SkeletonList />}
          {status === "bootstrapping" && <BootstrapState />}
          {status === "error" && <ErrorState onRetry={() => void load()} />}
          {status === "ready" && visible.length === 0 && <EmptyState tab={tab} hasAnything={inTab.length > 0} />}
          {status === "ready" && shown.map((item, index) => <NewsCard key={item.id} item={item} now={now} query={query} entranceIndex={index} />)}
          {status === "ready" && visible.length > limit ? (
            <div className="feed-load-more">
              <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="command-button">Load next dispatches / {visible.length - limit} remaining</button>
            </div>
          ) : null}
        </section>
      </main>
      <footer className="site-footer">
        <div className="site-footer__inner">
          <span className="site-footer__mark"><span>SIGNAL</span><span>DESK</span></span>
          <span>Local-first reading / compact JSON / no images / no trackers / press <kbd>R</kbd> to sync</span>
        </div>
      </footer>
      <ControlPanel open={consoleOpen} onClose={closeConsole} />
    </div>
  );
}

function SkeletonList() {
  return <div aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <div className="feed-skeleton" key={index}><div className="feed-skeleton__line w-1/5" /><div className="feed-skeleton__line mt-4 w-4/5" /><div className="feed-skeleton__line w-3/5" /></div>)}</div>;
}

function BootstrapState() {
  return <div className="state-panel"><div className="state-glyph"><GlobeIcon size={23} /></div><h3 className="state-title">Building the first edition</h3><p className="state-copy">The local server is collecting its first round of feeds. This desk will populate automatically when the wires return.</p></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return <div className="state-panel"><div className="state-glyph">!</div><h3 className="state-title">The desk is offline</h3><p className="state-copy">The local API could not be reached. Start the server, then try again.</p><button type="button" onClick={onRetry} className="command-button command-button--accent state-panel__action">Try again</button></div>;
}

function EmptyState({ tab, hasAnything }: { tab: Region; hasAnything: boolean }) {
  const place = tab === "persian-diaspora" ? "Persian desk" : tab === "iran" ? "Islamic Republic desk" : "global wire";
  return <div className="state-panel"><h3 className="state-title">No dispatches here</h3><p className="state-copy">{hasAnything ? "No stories match the current search. Clear it to widen the desk." : `The ${place} returned nothing new in this window. Try syncing from the header.`}</p></div>;
}
