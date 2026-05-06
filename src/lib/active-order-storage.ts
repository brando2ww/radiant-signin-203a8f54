// Persistência client-side do "pedido em acompanhamento" por estabelecimento.
// Sobrevive a reload do navegador para o cliente continuar vendo o status.

const KEY = (userId: string) => `velara:active-order:${userId}`;
const EVENT = "velara:active-order-changed";

export function getActiveOrderId(userId: string): string | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY(userId));
  } catch {
    return null;
  }
}

export function setActiveOrderId(userId: string, orderId: string) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(userId), orderId);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, orderId } }));
  } catch {
    /* ignore */
  }
}

export function clearActiveOrderId(userId: string) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(userId));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, orderId: null } }));
  } catch {
    /* ignore */
  }
}

export function subscribeActiveOrder(userId: string, cb: (orderId: string | null) => void) {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail || detail.userId === userId) {
      cb(getActiveOrderId(userId));
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY(userId)) cb(e.newValue);
  };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}
