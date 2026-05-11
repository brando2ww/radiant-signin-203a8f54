import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { SelectedOption } from "@/components/pdv/ProductOptionSelector";

/**
 * Rascunho do garçom — itens montados antes de enviar para a cozinha.
 *
 * Regras críticas:
 * - O rascunho vive **apenas** no dispositivo/aba do garçom (sessionStorage).
 * - É escopo por usuário (chave inclui userId), nunca cruza entre garçons.
 * - Nada vai para o banco até o "Enviar para a cozinha"; antes disso, outro
 *   garçom abrindo a mesma comanda nunca enxerga este rascunho.
 * - Logout / fechamento de aba / expiração da sessão = rascunho descartado.
 * - TTL implícito de 8 horas para evitar lixo eterno em abas abandonadas.
 */

export type DraftItem = {
  draftId: string;
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  selectedOptions?: SelectedOption[];
  createdAt: number;
};

type DraftCart = Record<string /* comandaId */, DraftItem[]>;

interface DraftCartContextValue {
  getItems: (comandaId: string) => DraftItem[];
  addItem: (
    comandaId: string,
    item: Omit<DraftItem, "draftId" | "createdAt">,
  ) => void;
  updateQuantity: (
    comandaId: string,
    draftId: string,
    quantity: number,
  ) => void;
  removeItem: (comandaId: string, draftId: string) => void;
  clear: (comandaId: string) => void;
  total: (comandaId: string) => number;
  count: (comandaId: string) => number;
  /**
   * Move drafts entre comandas, com suporte a quantidade parcial.
   * `qtyMap` (opcional) define quantidade a mover por draftId; se ausente
   * para um draftId, move a quantidade inteira. Se mover < quantidade total,
   * o item original permanece na origem com a quantidade remanescente e um
   * novo draft é criado no destino.
   */
  transferDraftItems: (
    fromComandaId: string,
    toComandaId: string,
    draftIds: string[],
    qtyMap?: Record<string, number>,
  ) => void;
}

const DraftCartContext = createContext<DraftCartContextValue | null>(null);

const TTL_MS = 8 * 60 * 60 * 1000; // 8h
const storageKey = (uid: string) => `garcom-draft:${uid}`;

const safeParse = (raw: string | null): DraftCart => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as DraftCart;
  } catch {
    /* ignore */
  }
  return {};
};

const pruneExpired = (cart: DraftCart): DraftCart => {
  const now = Date.now();
  const out: DraftCart = {};
  for (const [comandaId, items] of Object.entries(cart)) {
    const fresh = items.filter((it) => now - it.createdAt < TTL_MS);
    if (fresh.length > 0) out[comandaId] = fresh;
  }
  return out;
};

export function DraftCartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [cart, setCart] = useState<DraftCart>({});
  const lastUserRef = useRef<string | null>(null);

  // Hidratação por usuário. Trocar de usuário = começar limpo (e o storage do
  // usuário anterior fica isolado pela chave; nunca é exposto a outro user).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lastUserRef.current === userId) return;
    lastUserRef.current = userId;
    if (!userId) {
      setCart({});
      return;
    }
    const raw = sessionStorage.getItem(storageKey(userId));
    setCart(pruneExpired(safeParse(raw)));
  }, [userId]);

  // Persistência reativa.
  useEffect(() => {
    if (typeof window === "undefined" || !userId) return;
    try {
      sessionStorage.setItem(storageKey(userId), JSON.stringify(cart));
    } catch {
      /* quota exceeded — ignora; rascunho continua em memória */
    }
  }, [cart, userId]);

  const addItem: DraftCartContextValue["addItem"] = useCallback(
    (comandaId, item) => {
      setCart((prev) => {
        const next: DraftCart = { ...prev };
        const list = next[comandaId] ? [...next[comandaId]] : [];
        list.push({
          ...item,
          draftId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          createdAt: Date.now(),
        });
        next[comandaId] = list;
        return next;
      });
    },
    [],
  );

  const updateQuantity: DraftCartContextValue["updateQuantity"] = useCallback(
    (comandaId, draftId, quantity) => {
      setCart((prev) => {
        const list = prev[comandaId];
        if (!list) return prev;
        const next: DraftCart = { ...prev };
        if (quantity <= 0) {
          const filtered = list.filter((it) => it.draftId !== draftId);
          if (filtered.length === 0) {
            delete next[comandaId];
          } else {
            next[comandaId] = filtered;
          }
          return next;
        }
        next[comandaId] = list.map((it) =>
          it.draftId === draftId ? { ...it, quantity } : it,
        );
        return next;
      });
    },
    [],
  );

  const removeItem: DraftCartContextValue["removeItem"] = useCallback(
    (comandaId, draftId) => {
      setCart((prev) => {
        const list = prev[comandaId];
        if (!list) return prev;
        const filtered = list.filter((it) => it.draftId !== draftId);
        const next: DraftCart = { ...prev };
        if (filtered.length === 0) delete next[comandaId];
        else next[comandaId] = filtered;
        return next;
      });
    },
    [],
  );

  const clear: DraftCartContextValue["clear"] = useCallback((comandaId) => {
    setCart((prev) => {
      if (!prev[comandaId]) return prev;
      const next = { ...prev };
      delete next[comandaId];
      return next;
    });
  }, []);

  const transferDraftItems: DraftCartContextValue["transferDraftItems"] =
    useCallback((fromComandaId, toComandaId, draftIds, qtyMap) => {
      if (!draftIds.length || fromComandaId === toComandaId) return;
      setCart((prev) => {
        const fromList = prev[fromComandaId];
        if (!fromList) return prev;
        const next: DraftCart = { ...prev };
        const toList = next[toComandaId] ? [...next[toComandaId]] : [];
        const newFromList: DraftItem[] = [];
        for (const it of fromList) {
          if (!draftIds.includes(it.draftId)) {
            newFromList.push(it);
            continue;
          }
          const requested = qtyMap?.[it.draftId];
          const moveQty =
            requested && requested > 0 && requested < it.quantity
              ? requested
              : it.quantity;
          // cria item novo no destino (novo draftId)
          toList.push({
            ...it,
            draftId:
              typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            quantity: moveQty,
            createdAt: Date.now(),
          });
          // mantém remanescente na origem
          if (moveQty < it.quantity) {
            newFromList.push({ ...it, quantity: it.quantity - moveQty });
          }
        }
        if (newFromList.length === 0) delete next[fromComandaId];
        else next[fromComandaId] = newFromList;
        next[toComandaId] = toList;
        return next;
      });
    }, []);

  const getItems = useCallback(
    (comandaId: string) => cart[comandaId] ?? [],
    [cart],
  );

  const total = useCallback(
    (comandaId: string) =>
      (cart[comandaId] ?? []).reduce(
        (s, it) => s + it.quantity * it.unitPrice,
        0,
      ),
    [cart],
  );

  const count = useCallback(
    (comandaId: string) =>
      (cart[comandaId] ?? []).reduce((s, it) => s + it.quantity, 0),
    [cart],
  );

  const value = useMemo<DraftCartContextValue>(
    () => ({ getItems, addItem, updateQuantity, removeItem, clear, total, count, transferDraftItems }),
    [getItems, addItem, updateQuantity, removeItem, clear, total, count, transferDraftItems],
  );

  return (
    <DraftCartContext.Provider value={value}>
      {children}
    </DraftCartContext.Provider>
  );
}

export function useDraftCart(): DraftCartContextValue {
  const ctx = useContext(DraftCartContext);
  if (!ctx) {
    throw new Error("useDraftCart must be used within a DraftCartProvider");
  }
  return ctx;
}
