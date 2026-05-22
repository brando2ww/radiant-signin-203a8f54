import { useEffect, useState, useCallback } from "react";
import type { DeliveryCustomer } from "@/hooks/use-delivery-customers";

const storageKey = (userId: string) => `pm:customer:${userId}`;

export function usePublicCustomer(userId: string | undefined) {
  const [customer, setCustomerState] = useState<DeliveryCustomer | null>(null);

  useEffect(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw) setCustomerState(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [userId]);

  const setCustomer = useCallback(
    (c: DeliveryCustomer | null) => {
      setCustomerState(c);
      if (!userId) return;
      try {
        if (c) localStorage.setItem(storageKey(userId), JSON.stringify(c));
        else localStorage.removeItem(storageKey(userId));
      } catch {
        // ignore
      }
    },
    [userId],
  );

  return { customer, setCustomer };
}
