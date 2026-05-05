/**
 * Varredura de uma faixa de CEPs via ViaCEP para descobrir bairros e ruas.
 * Dado um prefixo de 5 dígitos, consulta {prefixo}000 a {prefixo}999.
 */

const CACHE_PREFIX = "cep-sweep:";
const CHUNK_SIZE = 8;

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
  prefix: string; // 5 dígitos
  source: "centro" | "first-cep";
}

/**
 * Detecta o prefixo de CEP (5 primeiros dígitos) de uma cidade.
 */
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
          return { prefix: cep.slice(0, 5), source: "centro" };
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

/**
 * Cache pode estar em formato antigo (string[]) ou novo ({entries, neighborhoods}).
 */
export function getCachedSweep(
  prefix: string,
): { neighborhoods: string[]; entries: SweepEntry[] } | null {
  try {
    const raw = localStorage.getItem(cacheKey(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // formato antigo: apenas bairros
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

export async function sweepCepRange(
  prefix5: string,
  options: SweepOptions = {},
): Promise<SweepResult> {
  const prefix = prefix5.replace(/\D/g, "").slice(0, 5).padEnd(5, "0");
  const total = 1000;
  const foundNeighborhoods = new Set<string>();
  const entries: SweepEntry[] = [];
  const seenCeps = new Set<string>();
  let done = 0;
  let cancelled = false;

  const ceps: string[] = [];
  for (let i = 0; i < total; i++) {
    ceps.push(`${prefix}${String(i).padStart(3, "0")}`);
  }

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

  for (let i = 0; i < ceps.length; i += CHUNK_SIZE) {
    if (options.signal?.aborted) {
      cancelled = true;
      break;
    }
    const chunk = ceps.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(fetchOne));
    done += chunk.length;
    const sortedNeighborhoods = Array.from(foundNeighborhoods).sort((a, b) =>
      a.localeCompare(b, "pt-BR"),
    );
    options.onProgress?.({
      done,
      total,
      neighborhoods: sortedNeighborhoods,
      entries: entries.slice(),
    });
  }

  const neighborhoods = Array.from(foundNeighborhoods).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  if (!cancelled) setCachedSweep(prefix, neighborhoods, entries);

  return { neighborhoods, entries, cancelled };
}
