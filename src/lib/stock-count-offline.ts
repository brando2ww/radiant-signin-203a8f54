/**
 * Fila local da contagem de estoque.
 *
 * Depósito e câmara fria não têm sinal. Sem isso o operador conta meia hora,
 * perde tudo e não conta de novo — então cada item é gravado no aparelho antes
 * de tentar o servidor, e a fila sobe sozinha quando a rede volta.
 *
 * A chave inclui a sessão: dois links diferentes no mesmo aparelho (cozinha e
 * bar) não podem misturar fila.
 */

export interface PendingCount {
  itemId: string;
  packs: number | null;
  loose: number | null;
  qty: number | null;
  /** Momento em que o operador contou, não em que subiu. */
  at: number;
}

const key = (sessionToken: string) => `velara:contagem:${sessionToken}`;

export function loadQueue(sessionToken: string): PendingCount[] {
  try {
    const raw = localStorage.getItem(key(sessionToken));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Navegação privada ou cota estourada não pode derrubar a contagem.
    return [];
  }
}

function saveQueue(sessionToken: string, fila: PendingCount[]): void {
  try {
    if (fila.length === 0) localStorage.removeItem(key(sessionToken));
    else localStorage.setItem(key(sessionToken), JSON.stringify(fila));
  } catch {
    /* ignora */
  }
}

/**
 * Enfileira uma contagem. Recontar o mesmo item substitui o anterior: vale o
 * último número que a pessoa digitou, não o primeiro.
 */
export function enqueue(sessionToken: string, p: PendingCount): void {
  const fila = loadQueue(sessionToken).filter((x) => x.itemId !== p.itemId);
  fila.push(p);
  saveQueue(sessionToken, fila);
}

export function dequeue(sessionToken: string, itemId: string): void {
  saveQueue(sessionToken, loadQueue(sessionToken).filter((x) => x.itemId !== itemId));
}

export function clearQueue(sessionToken: string): void {
  saveQueue(sessionToken, []);
}

/** Guarda a sessão para reabrir o link e continuar de onde parou. */
const SESSION_KEY = "velara:contagem:sessao";

export function saveSession(token: string, session: unknown): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, session, at: Date.now() }));
  } catch {
    /* ignora */
  }
}

export function loadSession(token: string): any | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    // Sessão de outro link, ou de ontem, não serve.
    if (p?.token !== token) return null;
    if (Date.now() - Number(p?.at ?? 0) > 24 * 60 * 60 * 1000) return null;
    return p.session ?? null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignora */
  }
}
