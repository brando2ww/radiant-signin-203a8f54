import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "loyalty_session_v1";

interface StoredSession {
  slug: string;
  user_id: string;
  customer_id: string;
  phone: string;
  session_token: string;
  session_expires_at: string;
}

function readSession(slug?: string): StoredSession | null {
  if (!slug) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.slug !== slug) return null;
    if (new Date(parsed.session_expires_at).getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function usePublicLoyaltySession(slug?: string) {
  const [session, setSession] = useState<StoredSession | null>(() => readSession(slug));

  useEffect(() => {
    setSession(readSession(slug));
  }, [slug]);

  const save = useCallback((s: StoredSession) => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSession(s);
  }, []);

  const clear = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return { session, save, clear };
}

export type { StoredSession };
