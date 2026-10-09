"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While `active`, re-fetch the page's server data every few seconds (router.refresh()
 * re-runs the Server Component without a full page reload). Used on the library while
 * some videos are still processing, so their cards turn "ready" by themselves.
 */
export function AutoRefresh({ active, everyMs = 4000 }: { active: boolean; everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), everyMs);
    return () => clearInterval(timer);
  }, [active, everyMs, router]);
  return null;
}
