"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "./toast";
import { NewsProvider } from "@/lib/news-context";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <NewsProvider>{children}</NewsProvider>
    </ToastProvider>
  );
}
