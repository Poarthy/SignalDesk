"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { PersianMark } from "@/components/LionSunFlag";
import type { Region } from "@/lib/types";

interface RegionCounts {
  global: number;
  "persian-diaspora": number;
  iran: number;
}

interface RegionOption {
  id: Region;
  label: ReactNode;
  count: number;
}

export function RegionSelect({ tab, onChange, counts }: { tab: Region; onChange: (region: Region) => void; counts: RegionCounts }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const options: RegionOption[] = [
    { id: "global", label: "Global", count: counts.global },
    { id: "persian-diaspora", label: <PersianMark size={14}>Persian</PersianMark>, count: counts["persian-diaspora"] },
    { id: "iran", label: "Islamic Republic", count: counts.iran },
  ];
  const active = options.find((option) => option.id === tab) ?? options[0];
  const activeIndex = Math.max(0, options.findIndex((option) => option.id === active.id));

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const openMenu = useCallback(() => setOpen(true), []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => optionRefs.current[activeIndex]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && event.target instanceof Node && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const select = (option: RegionOption) => {
    onChange(option.id);
    close();
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    const current = optionRefs.current.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (current < 0) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      optionRefs.current[(current + direction + options.length) % options.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      optionRefs.current[options.length - 1]?.focus();
    }
  };

  const onRootKeyDown = (event: React.KeyboardEvent) => {
    if (open && event.key === "Tab") setOpen(false);
  };

  return (
    <div ref={rootRef} className="region-select" onKeyDown={onRootKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        className="region-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? close(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="region-select__label">{active.label}</span>
        <span className="region-count region-select__count"><AnimatedNumber value={active.count} /></span>
        <ChevronDownIcon size={12} className={open ? "region-select__chevron region-select__chevron--open" : "region-select__chevron"} />
      </button>
      {open ? (
        <ul role="listbox" aria-label="News sections" className="region-menu" onKeyDown={onMenuKeyDown}>
          {options.map((option, index) => (
            <li key={option.id}>
              <button
                ref={(node) => { optionRefs.current[index] = node; }}
                type="button"
                role="option"
                aria-selected={tab === option.id}
                className="region-menu__option"
                onClick={() => select(option)}
              >
                <span className="region-menu__label">{option.label}</span>
                <span className="region-menu__meta">
                  <span className="region-count"><AnimatedNumber value={option.count} /></span>
                  {tab === option.id ? <CheckIcon size={12} /> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
