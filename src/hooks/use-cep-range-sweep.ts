/**
 * Varredura de uma faixa de CEPs via ViaCEP para descobrir bairros.
 * Dado um prefixo de 5 dígitos, consulta {prefixo}000 a {prefixo}999.
 */

const CACHE_PREFIX = "cep-sweep:";
const CHUNK_SIZE = 8;

interface SweepOptions {
  signal?: AbortSignal;
  onProgress?: (info: {
    done: number;
    total: number;
    neighborhoods: string[];
  }) => void;
}

interface SweepResult {
  neighborhoods: string[];
  cancelled: boolean;
}

export interface CepPrefixDetection {
  prefix: string; // 5 dígitos
  source: "centro" | "first-cep";
}

/**
 * Detecta o prefixo de CEP (5 primeiros dígitos) de uma cidade,
 * tentando alguns logradouros comuns via ViaCEP.
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
      // ignora e tenta próximo
    }
  }
  return null;
}

function cacheKey(prefix: string) {
  return `${CACHE_PREFIX}${prefix}`;
}

export function getCachedSweep(prefix: string): string[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(prefix));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    /* noop */
  }
  return null;
}

function setCachedSweep(prefix: string, neighborhoods: string[]) {
  try {
    localStorage.setItem(cacheKey(prefix), JSON.stringify(neighborhoods));
  } catch {
    /* noop */
  }
}

/**
 * Varre todos os 1000 CEPs do prefixo e retorna a lista única de bairros.
 */
export async function sweepCepRange(
  prefix5: string,
  options: SweepOptions = {},
): Promise<SweepResult> {
  const prefix = prefix5.replace(/\D/g, "").slice(0, 5).padEnd(5, "0");
  const total = 1000;
  const found = new Set<string>();
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
      if (data && !data.erro && data.bairro) {
        const name = String(data.bairro).trim();
        if (name) found.add(name);
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
    options.onProgress?.({
      done,
      total,
      neighborhoods: Array.from(found).sort((a, b) => a.localeCompare(b, "pt-BR")),
    });
  }

  const neighborhoods = Array.from(found).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  if (!cancelled) setCachedSweep(prefix, neighborhoods);

  return { neighborhoods, cancelled };
}
