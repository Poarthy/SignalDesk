"use client";

import { useEffect, useRef, useState } from "react";
import { timeAgo } from "@/lib/time";
import { splitByQuery } from "@/lib/highlight";
import { translateTexts } from "@/lib/api";
import type { NewsItem } from "@/lib/types";
import { useToast } from "./toast";
import { ProgressRing } from "./ProgressRing";
import { ExternalIcon, TranslateIcon, XIcon } from "./icons";

interface PersianTranslation {
  srcTitle: string;
  srcSummary: string;
  title: string;
  summary: string;
}

const translationCache = new Map<string, PersianTranslation>();
const revealedStoryIds = new Set<string>();

function cachedTranslation(item: NewsItem): PersianTranslation | null {
  const hit = translationCache.get(item.id);
  return hit && hit.srcTitle === item.title && hit.srcSummary === item.summary ? hit : null;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitByQuery(text, query).map((part, i) =>
        part.highlight ? <mark key={i} className="match-mark">{part.text}</mark> : <span key={i}>{part.text}</span>
      )}
    </>
  );
}

export default function NewsCard({ item, now, query = "", entranceIndex = 0 }: { item: NewsItem; now: number; query?: string; entranceIndex?: number }) {
  const toast = useToast();
  const [fa, setFa] = useState<PersianTranslation | null>(() => cachedTranslation(item));
  const [loading, setLoading] = useState(false);
  const activeFa = fa && fa.srcTitle === item.title && fa.srcSummary === item.summary ? fa : null;
  const showFa = Boolean(activeFa);
  const rtl = item.lang === "fa" || showFa;
  const storyRef = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(() => revealedStoryIds.has(item.id));

  useEffect(() => {
    if (revealed) return;
    const reveal = () => {
      revealedStoryIds.add(item.id);
      setRevealed(true);
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      reveal();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          reveal();
        }
      },
      { threshold: 0.14 },
    );
    if (storyRef.current) observer.observe(storyRef.current);
    return () => observer.disconnect();
  }, [item.id, revealed]);

  const toggleTranslation = async () => {
    if (activeFa) {
      setFa(null);
      return;
    }
    const hit = cachedTranslation(item);
    if (hit) {
      setFa(hit);
      return;
    }
    setLoading(true);
    try {
      const texts = [item.title, item.summary].filter(Boolean);
      const out = await translateTexts(texts);
      let index = 0;
      const entry = {
        srcTitle: item.title,
        srcSummary: item.summary,
        title: item.title ? out[index++] ?? "" : "",
        summary: item.summary ? out[index++] ?? "" : "",
      };
      translationCache.set(item.id, entry);
      setFa(entry);
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Translation failed", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <article ref={storyRef} className={`story-row ${revealed ? "is-revealed" : ""} ${!revealed && entranceIndex < 8 ? `page-enter page-enter-card-${entranceIndex}` : ""}`} dir="ltr">
      <header className="story-meta">
        <span role="img" aria-label={item.country}>{item.flag}</span>
        <span className="story-source">{item.sourceName}</span>
        <span className="story-separator" aria-hidden>/</span>
        <time dateTime={item.publishedAt} className="story-time">{timeAgo(item.publishedAt, now)}</time>
        {item.lang === "en" ? (
          <button
            type="button"
            onClick={() => void toggleTranslation()}
            disabled={loading}
            aria-pressed={showFa}
            title={showFa ? "Show original (English)" : "Translate to Persian"}
            className={`translation-toggle ${showFa ? "translation-toggle--active" : ""}`}
          >
            {loading ? <ProgressRing size={11} stroke={2} spinning /> : showFa ? <XIcon size={10} /> : <TranslateIcon size={11} />}
            {showFa ? "EN" : "FA"}
          </button>
        ) : null}
      </header>
      <div dir={rtl ? "rtl" : undefined} className={rtl ? "font-fa" : ""}>
        <h2 className="story-title">
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            {activeFa ? activeFa.title || item.title : <HighlightedText text={item.title} query={query} />}
            <ExternalIcon className="story-external-icon ms-2 inline-block text-ink-muted rtl:-scale-x-100" />
          </a>
        </h2>
        {activeFa?.summary ? (
          <p dir="auto" lang="fa" className="story-summary">{activeFa.summary}</p>
        ) : item.summary ? (
          <p className="story-summary"><HighlightedText text={item.summary} query={query} /></p>
        ) : null}
      </div>
    </article>
  );
}
