'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Re-renders the server components every few seconds while the tab is visible; client state survives.
export function AutoRefresh(props: { everyMs?: number }) {
  const { everyMs = 5000 } = props;
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) return;
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs]);
  return null;
}
