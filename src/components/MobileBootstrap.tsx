"use client";

import { useEffect, useRef } from "react";
import { useNews } from "@/lib/news-context";
import { installMobileApi, isMobileBuild } from "@/mobile/install";

installMobileApi();

export default function MobileBootstrap() {
  const { data, status, refreshAndNotify } = useNews();
  const hasStartedInitialSync = useRef(false);

  useEffect(() => {
    if (!isMobileBuild || hasStartedInitialSync.current || status !== "ready" || !data || data.itemCount > 0) return;
    hasStartedInitialSync.current = true;
    void refreshAndNotify();
  }, [data, refreshAndNotify, status]);

  return null;
}
