import type { ReactNode } from "react";

/** Bundled Lion and Sun flag emoji — served from /emoji, no network. */
export function LionSunFlag({
  size = 18,
  className = "",
  title = "Lion and Sun flag",
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <img
      src="/emoji/lion-and-sun.png"
      width={Math.round(size * (1280 / 910))}
      height={size}
      alt=""
      title={title}
      draggable={false}
      className={`lion-sun-flag inline-block shrink-0 object-contain ${className}`}
    />
  );
}

export function PersianMark({
  children = "Persian",
  size = 18,
  className = "",
}: {
  children?: ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <LionSunFlag size={size} />
      <span>{children}</span>
    </span>
  );
}
