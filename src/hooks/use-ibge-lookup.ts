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
  street: string,
  signal?: AbortSignal,
): Promise<ViaCEPStreetResult[]> {
  if (!uf || !city || !street || street.length < 3) return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  const onParentAbort = () => ctl.abort();
  signal?.addEventListener("abort", onParentAbort);
  try {
    const encodedCity = encodeURIComponent(city);
    const encodedStreet = encodeURIComponent(street);
    const res = await fetch(
      `https://viacep.com.br/ws/${uf}/${encodedCity}/${encodedStreet}/json/`,
      { signal: ctl.signal },
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data as ViaCEPStreetResult[];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onParentAbort);
  }
}

const SEARCH_TERMS_BASIC = [
  "Rua", "Avenida", "Travessa", "Alameda", "Estrada", "Rodovia", "Praça",
  "Largo", "Beco", "Servidão", "Vila", "Conjunto", "Quadra", "Parque",
  "Jardim", "Loteamento", "Setor", "Núcleo", "Residencial",
];

// Nomes de bairros recorrentes em cidades brasileiras — ajudam em municípios
// pequenos onde "Rua/Avenida" retorna pouquíssimas ruas no ViaCEP.
const COMMON_NEIGHBORHOOD_NAMES = [
  "Centro", "Centro Histórico", "São José", "São Pedro", "São João",
  "São Francisco", "São Cristóvão", "Santa Catarina", "Santa Rita",
  "Santa Tereza", "Santa Lúcia", "Santo Antônio", "Nossa Senhora",
  "Industrial", "Operário", "Comercial",
  "Cidade Alta", "Cidade Baixa", "Cidade Nova",
  "Bela Vista", "Boa Vista", "Bom Retiro", "Bom Pastor", "Bom Princípio",
  "Vila Nova", "Vila Verde", "Vila Rica",
  "Planalto", "Cruzeiro", "Aparecida", "Esperança", "União", "Progresso",
  "Floresta", "Glória", "Liberdade", "Independência", "República",
  "Conventos", "Cohab", "Imigrante", "Borgo", "Belvedere",
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

async function fetchIBGESubdistricts(municipioId: number): Promise<string[]> {
  return withRetry(async () => {
    const res = await fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/${municipioId}/subdistritos`,
    );
    if (!res.ok) return [];
    const data: { id: number; nome: string }[] = await res.json();
    return data.map((d) => d.nome).filter(Boolean);
  }, [] as string[]);
}


const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const memCache = new Map<string, { list: string[]; ts: number }>();
const cacheKeyV2 = (uf: string, city: string) =>
  `neigh-v2:${uf}:${normalizeKey(city)}`;

export interface CachedNeighborhoods {
  list: string[];
  ts: number;
}

export function readNeighborhoodsCache(
  uf: string,
  city: string,
): CachedNeighborhoods | null {
  const key = cacheKeyV2(uf, city);
  const fresh = (e: { list: string[]; ts: number }) =>
    Date.now() - e.ts < CACHE_TTL_MS;
  const mem = memCache.get(key);
  if (mem && fresh(mem)) return { list: mem.list, ts: mem.ts };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { list: string[]; ts: number };
    if (!parsed?.list || !fresh(parsed)) return null;
    memCache.set(key, parsed);
    return { list: parsed.list, ts: parsed.ts };
  } catch {
    return null;
  }
}

function writeCacheV2(uf: string, city: string, list: string[]) {
  const entry = { list, ts: Date.now() };
  const key = cacheKeyV2(uf, city);
  memCache.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export function clearNeighborhoodsCache(uf: string, city: string) {
  const key = cacheKeyV2(uf, city);
  memCache.delete(key);
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export interface FetchNeighborhoodsOptions {
  onProgress?: (currentList: string[]) => void;
  seed?: string[];
  signal?: AbortSignal;
}

/**
 * Busca híbrida IBGE + ViaCEP A–Z.
 * Cache em localStorage por 24h.
 */
export async function fetchAllNeighborhoods(
  uf: string,
  city: string,
  options: FetchNeighborhoodsOptions = {},
): Promise<string[]> {
  if (!uf || !city) return [];
  const { onProgress, seed, signal } = options;

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

  // 1) IBGE — distritos + subdistritos oficiais
  const municipioId = await fetchMunicipioId(uf, city);
  if (signal?.aborted) return snapshot();
  if (municipioId) {
    const [distritos, subdistritos] = await Promise.all([
      fetchIBGEDistricts(municipioId),
      fetchIBGESubdistricts(municipioId),
    ]);
    distritos.forEach(add);
    subdistritos.forEach(add);
    onProgress?.(snapshot());
  }

  const runViaCEP = async (queries: string[]) => {
    if (signal?.aborted) return;
    await runInChunks(
      queries,
      10,
      (q) => withRetry(() => searchStreetByName(uf, city, q, signal), []),
      (chunkResults) => {
        chunkResults.flat().forEach((r) => add(r.bairro));
        onProgress?.(snapshot());
      },
    );
  };

  // 2) Termos básicos
  await runViaCEP(SEARCH_TERMS_BASIC);
  if (signal?.aborted) return snapshot();
  // 3) Nomes comuns de bairros
  await runViaCEP(COMMON_NEIGHBORHOOD_NAMES);
  if (signal?.aborted) return snapshot();
  // 4) Varredura A–Z
  const azQueries: string[] = [];
  for (const term of SEARCH_TERMS_BASIC) {
    for (const letter of ALPHABET) azQueries.push(`${term} ${letter}`);
  }
  await runViaCEP(azQueries);

  const final = snapshot();
  if (!signal?.aborted) writeCacheV2(uf, city, final);
  return final;
}

