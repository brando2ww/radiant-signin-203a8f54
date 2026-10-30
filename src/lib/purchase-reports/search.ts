/** Busca por palavras, sem acentos: "óleo de algodão" encontra "Oleo Algodão". */
export function matchesPurchaseSearch(value: string, query: string): boolean {
  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const haystack = normalize(value);
  const terms = normalize(query).trim().split(/\s+/).filter((term) => term && !["de", "da", "do", "das", "dos"].includes(term));
  return terms.every((term) => haystack.includes(term));
}
