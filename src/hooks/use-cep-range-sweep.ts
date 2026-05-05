/**
 * Varredura de uma faixa de CEPs via ViaCEP para descobrir bairros e ruas.
 * Suporta varrer múltiplos prefixos de 5 dígitos (ex.: 95720 até 95725).
 */

const CACHE_PREFIX = "cep-sweep:";
const MANUAL_PREFIX = "manual-neighborhoods:";
const CHUNK_SIZE = 60;
const REQUEST_TIMEOUT_MS = 4000;
const EARLY_EXIT_AFTER = 200; // CEPs sem entries novos antes de pular o prefixo

export interface SweepEntry {
  cep: string;
  street: string;
  neighborhood: string;
}

interface SweepOptions {
  signal?: AbortSignal;
  onProgress?: (info: {
    done: number;
    total: number;
    neighborhoods: string[];
    entries: SweepEntry[];
  }) => void;
}

interface SweepResult {
  neighborhoods: string[];
  entries: SweepEntry[];
  cancelled: boolean;
}

export interface CepPrefixDetection {
  start: string; // 5 dígitos
  end: string; // 5 dígitos
  source: "centro" | "first-cep";
}

export async function detectCityCepPrefix(
  uf: string,
  city: string,
): Promise<CepPrefixDetection | null> {
  const candidates = ["Centro", "Rua Principal", "Avenida Brasil", "Rua"];
  for (const term of candidates) {
    try {
      const url = `https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(
        city,
      )}/${encodeURIComponent(term)}/json/`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const cep = String(data[0].cep || "").replace(/\D/g, "");
        if (cep.length === 8) {
          const prefix = cep.slice(0, 5);
          return { start: prefix, end: prefix, source: "centro" };
        }
      }
    } catch {
      /* tenta próximo */
    }
  }
  return null;
}

function cacheKey(prefix: string) {
  return `${CACHE_PREFIX}${prefix}`;
}

export function getCachedSweep(
  prefix: string,
): { neighborhoods: string[]; entries: SweepEntry[] } | null {
  try {
    const raw = localStorage.getItem(cacheKey(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { neighborhoods: parsed, entries: [] };
    }
    if (parsed && Array.isArray(parsed.neighborhoods)) {
      return {
        neighborhoods: parsed.neighborhoods,
        entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      };
    }
  } catch {
    /* noop */
  }
  return null;
}

function setCachedSweep(
  prefix: string,
  neighborhoods: string[],
  entries: SweepEntry[],
) {
  try {
    localStorage.setItem(
      cacheKey(prefix),
      JSON.stringify({ neighborhoods, entries }),
    );
  } catch {
    /* noop */
  }
}

/* ------------ Bairros manuais (fallback p/ cidades de CEP geral) ----------- */

function manualKey(uf: string, city: string) {
  return `${MANUAL_PREFIX}${uf.toUpperCase()}-${city.toLowerCase().trim()}`;
}

export function getManualNeighborhoods(uf: string, city: string): string[] {
  try {
    const raw = localStorage.getItem(manualKey(uf, city));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function setManualNeighborhoods(
  uf: string,
  city: string,
  list: string[],
) {
  try {
    const dedup = Array.from(
      new Set(list.map((s) => s.trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b, "pt-BR"));
    localStorage.setItem(manualKey(uf, city), JSON.stringify(dedup));
  } catch {
    /* noop */
  }
}

/* ----------------------------- Varredura ----------------------------------- */

function normalizePrefix(p: string): string {
  return p.replace(/\D/g, "").slice(0, 5).padEnd(5, "0");
}

/**
 * Varre uma faixa contínua de prefixos de 5 dígitos.
 * sweepCepRange("95720") => varre só 95720000–95720999
 * sweepCepRange("95720", "95725") => varre 95720000–95725999
 */
export async function sweepCepRange(
  prefixStart: string,
  prefixEndOrOptions?: string | SweepOptions,
  maybeOptions?: SweepOptions,
): Promise<SweepResult> {
  const start = normalizePrefix(prefixStart);
  const end =
    typeof prefixEndOrOptions === "string"
      ? normalizePrefix(prefixEndOrOptions)
      : start;
  const options: SweepOptions =
    (typeof prefixEndOrOptions === "object" ? prefixEndOrOptions : maybeOptions) ||
    {};

  const startN = parseInt(start, 10);
  const endN = parseInt(end, 10);
  if (endN < startN) {
    return { neighborhoods: [], entries: [], cancelled: false };
  }

  const prefixes: string[] = [];
  for (let p = startN; p <= endN; p++) {
    prefixes.push(String(p).padStart(5, "0"));
  }

  const total = prefixes.length * 1000;
  const foundNeighborhoods = new Set<string>();
  const entries: SweepEntry[] = [];
  const seenCeps = new Set<string>();
  let done = 0;
  let cancelled = false;

  const fetchOne = async (cep: string) => {
    if (options.signal?.aborted) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: options.signal,
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && !data.erro) {
        const neighborhood = String(data.bairro || "").trim();
        const street = String(data.logradouro || "").trim();
        const formattedCep = String(data.cep || cep);
        if (neighborhood) foundNeighborhoods.add(neighborhood);
        if (!seenCeps.has(formattedCep) && (neighborhood || street)) {
          seenCeps.add(formattedCep);
          entries.push({ cep: formattedCep, street, neighborhood });
        }
      }
    } catch {
      /* ignora erros individuais */
    }
  };

  outer: for (const prefix of prefixes) {
    // Sempre varre do zero — sem reaproveitar cache
    const ceps: string[] = [];
    for (let i = 0; i < 1000; i++) {
      ceps.push(`${prefix}${String(i).padStart(3, "0")}`);
    }

    const prefixNeighborhoods = new Set<string>();
    const prefixEntries: SweepEntry[] = [];
    const prefixSeen = new Set<string>();

    const fetchOneForPrefix = async (cep: string) => {
      if (options.signal?.aborted) return;
      const timeoutCtl = new AbortController();
      const timer = setTimeout(() => timeoutCtl.abort(), REQUEST_TIMEOUT_MS);
      const onParentAbort = () => timeoutCtl.abort();
      options.signal?.addEventListener("abort", onParentAbort);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
          signal: timeoutCtl.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data && !data.erro) {
          const neighborhood = String(data.bairro || "").trim();
          const street = String(data.logradouro || "").trim();
          const formattedCep = String(data.cep || cep);
          if (neighborhood) {
            foundNeighborhoods.add(neighborhood);
            prefixNeighborhoods.add(neighborhood);
          }
          if (!seenCeps.has(formattedCep) && (neighborhood || street)) {
            seenCeps.add(formattedCep);
            entries.push({ cep: formattedCep, street, neighborhood });
          }
          if (!prefixSeen.has(formattedCep) && (neighborhood || street)) {
            prefixSeen.add(formattedCep);
            prefixEntries.push({ cep: formattedCep, street, neighborhood });
          }
        }
      } catch {
        /* noop */
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onParentAbort);
      }
    };

    let cepsSinceLastFind = 0;
    let lastEntryCount = prefixEntries.length;

    for (let i = 0; i < ceps.length; i += CHUNK_SIZE) {
      if (options.signal?.aborted) {
        cancelled = true;
        break outer;
      }
      const chunk = ceps.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map(fetchOneForPrefix));
      done += chunk.length;

      // Early-exit: se o prefixo está vazio (nenhuma entry nova após X CEPs), pula
      if (prefixEntries.length === lastEntryCount) {
        cepsSinceLastFind += chunk.length;
      } else {
        cepsSinceLastFind = 0;
        lastEntryCount = prefixEntries.length;
      }

      const sorted = Array.from(foundNeighborhoods).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
      options.onProgress?.({
        done,
        total,
        neighborhoods: sorted,
        entries: entries.slice(),
      });

      if (cepsSinceLastFind >= EARLY_EXIT_AFTER) {
        // Pula o restante deste prefixo — não está retornando nada
        const skipped = ceps.length - (i + chunk.length);
        done += skipped;
        options.onProgress?.({
          done,
          total,
          neighborhoods: Array.from(foundNeighborhoods).sort((a, b) =>
            a.localeCompare(b, "pt-BR"),
          ),
          entries: entries.slice(),
        });
        break;
      }
    }

    // Cache deste prefixo individualmente
    if (!options.signal?.aborted) {
      const sortedPrefixN = Array.from(prefixNeighborhoods).sort((a, b) =>
        a.localeCompare(b, "pt-BR"),
      );
      setCachedSweep(prefix, sortedPrefixN, prefixEntries);
    }
  }

  const neighborhoods = Array.from(foundNeighborhoods).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  // suprime variável não usada
  void fetchOne;

  return { neighborhoods, entries, cancelled };
}
