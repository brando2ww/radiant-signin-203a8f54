import { useState, useEffect } from "react";

interface IBGEState {
  id: number;
  sigla: string;
  nome: string;
}

interface IBGECity {
  id: number;
  nome: string;
}

const STATES: { sigla: string; nome: string }[] = [
  { sigla: "AC", nome: "Acre" },
  { sigla: "AL", nome: "Alagoas" },
  { sigla: "AP", nome: "Amapá" },
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "BA", nome: "Bahia" },
  { sigla: "CE", nome: "Ceará" },
  { sigla: "DF", nome: "Distrito Federal" },
  { sigla: "ES", nome: "Espírito Santo" },
  { sigla: "GO", nome: "Goiás" },
  { sigla: "MA", nome: "Maranhão" },
  { sigla: "MT", nome: "Mato Grosso" },
  { sigla: "MS", nome: "Mato Grosso do Sul" },
  { sigla: "MG", nome: "Minas Gerais" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "PB", nome: "Paraíba" },
  { sigla: "PR", nome: "Paraná" },
  { sigla: "PE", nome: "Pernambuco" },
  { sigla: "PI", nome: "Piauí" },
  { sigla: "RJ", nome: "Rio de Janeiro" },
  { sigla: "RN", nome: "Rio Grande do Norte" },
  { sigla: "RS", nome: "Rio Grande do Sul" },
  { sigla: "RO", nome: "Rondônia" },
  { sigla: "RR", nome: "Roraima" },
  { sigla: "SC", nome: "Santa Catarina" },
  { sigla: "SP", nome: "São Paulo" },
  { sigla: "SE", nome: "Sergipe" },
  { sigla: "TO", nome: "Tocantins" },
];

export function useIBGEStates() {
  return STATES;
}

export function useIBGECities(uf: string) {
  const [cities, setCities] = useState<IBGECity[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!uf) {
      setCities([]);
      return;
    }

    setIsLoading(true);
    fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
      .then((res) => res.json())
      .then((data: IBGECity[]) => {
        setCities(data);
      })
      .catch(() => setCities([]))
      .finally(() => setIsLoading(false));
  }, [uf]);

  return { cities, isLoading };
}

export interface ViaCEPStreetResult {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
}

export async function searchStreetByName(
  uf: string,
  city: string,
  street: string
): Promise<ViaCEPStreetResult[]> {
  if (!uf || !city || !street || street.length < 3) return [];
  try {
    const encodedCity = encodeURIComponent(city);
    const encodedStreet = encodeURIComponent(street);
    const res = await fetch(
      `https://viacep.com.br/ws/${uf}/${encodedCity}/${encodedStreet}/json/`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as ViaCEPStreetResult[];
  } catch {
    return [];
  }
}

const SEARCH_TERMS_BASIC = [
  "Rua", "Avenida", "Travessa", "Alameda", "Estrada", "Rodovia", "Praça",
  "Largo", "Beco", "Servidão", "Vila", "Conjunto", "Quadra", "Parque",
  "Jardim", "Loteamento", "Setor", "Núcleo", "Residencial",
];

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const normalizeKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

async function withRetry<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch {
    try { return await fn(); } catch { return fallback; }
  }
}

async function runInChunks<T, R>(
  items: T[],
  size: number,
  worker: (item: T) => Promise<R>,
  onChunkDone?: (results: R[]) => void,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const slice = items.slice(i, i + size);
    const chunkResults = await Promise.all(slice.map(worker));
    out.push(...chunkResults);
    onChunkDone?.(chunkResults);
  }
  return out;
}

async function fetchMunicipioId(uf: string, city: string): Promise<number | null> {
  return withRetry(async () => {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`,
    );
    if (!res.ok) return null;
    const data: { id: number; nome: string }[] = await res.json();
    const target = normalizeKey(city);
    const match = data.find((m) => normalizeKey(m.nome) === target);
    return match?.id ?? null;
  }, null);
}

async function fetchIBGEDistricts(municipioId: number): Promise<string[]> {
  return withRetry(async () => {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${municipioId}/distritos`,
    );
    if (!res.ok) return [];
    const data: { id: number; nome: string }[] = await res.json();
    return data.map((d) => d.nome).filter(Boolean);
  }, [] as string[]);
}

const memCache = new Map<string, string[]>();
const cacheKey = (uf: string, city: string, deep: boolean) =>
  `neigh:${uf}:${normalizeKey(city)}:${deep ? "deep" : "fast"}`;

function readCache(key: string): string[] | null {
  if (memCache.has(key)) return memCache.get(key)!;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as string[];
    memCache.set(key, parsed);
    return parsed;
  } catch { return null; }
}

function writeCache(key: string, list: string[]) {
  memCache.set(key, list);
  try { sessionStorage.setItem(key, JSON.stringify(list)); } catch { /* quota */ }
}

export interface FetchNeighborhoodsOptions {
  deep?: boolean;
  onProgress?: (currentList: string[]) => void;
  seed?: string[];
}

/**
 * Busca de bairros híbrida: IBGE (oficial) + ViaCEP (termos expandidos, A–Z em deep).
 * Dedup por chave normalizada (sem acento, lower); preserva grafia original.
 */
export async function fetchAllNeighborhoods(
  uf: string,
  city: string,
  options: FetchNeighborhoodsOptions = {},
): Promise<string[]> {
  if (!uf || !city) return [];
  const { deep = false, onProgress, seed } = options;

  const key = cacheKey(uf, city, deep);
  const cached = readCache(key);
  if (cached) { onProgress?.(cached); return cached; }

  const map = new Map<string, string>();
  const add = (raw?: string) => {
    const name = raw?.trim();
    if (!name) return;
    const k = normalizeKey(name);
    if (!map.has(k)) map.set(k, name);
  };
  seed?.forEach(add);

  const snapshot = () =>
    [...map.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));

  // 1) IBGE — distritos oficiais
  const municipioId = await fetchMunicipioId(uf, city);
  if (municipioId) {
    const distritos = await fetchIBGEDistricts(municipioId);
    distritos.forEach(add);
    onProgress?.(snapshot());
  }

  // 2) ViaCEP — termos básicos (rápido)
  await runInChunks(
    SEARCH_TERMS_BASIC,
    6,
    (term) => withRetry(() => searchStreetByName(uf, city, term), []),
    (chunkResults) => {
      chunkResults.flat().forEach((r) => add(r.bairro));
      onProgress?.(snapshot());
    },
  );

  // 3) Varredura A–Z exaustiva (opcional)
  if (deep) {
    const queries: string[] = [];
    for (const term of SEARCH_TERMS_BASIC) {
      for (const letter of ALPHABET) queries.push(`${term} ${letter}`);
    }
    await runInChunks(
      queries,
      6,
      (q) => withRetry(() => searchStreetByName(uf, city, q), []),
      (chunkResults) => {
        chunkResults.flat().forEach((r) => add(r.bairro));
        onProgress?.(snapshot());
      },
    );
  }

  const final = snapshot();
  writeCache(key, final);
  return final;
}
