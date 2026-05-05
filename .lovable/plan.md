# Cobertura de entrega — busca completa de bairros

## Problema

`fetchAllNeighborhoods` em `src/hooks/use-ibge-lookup.ts` consulta apenas 7 termos de logradouro no ViaCEP, que limita 50 resultados por requisição. Em cidades médias/grandes a lista satura e bairros inteiros somem do `NeighborhoodSelectorModal`.

## Solução — busca híbrida em duas fontes

### Fonte 1 — IBGE (oficial, prioridade)
- Resolver `municipioId` via `https://servicodados.ibge.gov.br/api/v1/localidades/estados/{uf}/municipios` comparando nome normalizado (sem acento, lower).
- Buscar distritos: `https://servicodados.ibge.gov.br/api/v1/localidades/municipios/{id}/distritos`.
- Cobertura total para cidades pequenas/médias com 1 requisição.

### Fonte 2 — ViaCEP (complemento)
- Termos expandidos: `Rua, Avenida, Travessa, Alameda, Estrada, Rodovia, Praça, Largo, Beco, Servidão, Vila, Conjunto, Quadra, Parque, Jardim, Loteamento, Setor, Núcleo, Residencial`.
- **Modo rápido (default)**: somente os termos acima — abertura ágil do modal.
- **Modo deep (sob demanda)**: para cada termo, varrer A–Z (`"Rua A"`, `"Rua B"`, …) quebrando o limite de 50 resultados.
- Execução em lotes de 6 paralelos (`runInChunks`) e `withRetry` (1 retentativa) por requisição — falha parcial não derruba o lote.

### Deduplicação e ordenação
- Mapa `Map<chaveNormalizada, nomeOriginal>` preservando a primeira grafia encontrada.
- Normalização: NFD + remover diacríticos + trim + lowercase (apenas para chave).
- Ordenação final com `localeCompare("pt-BR")`.

### Cache
- Chave `neigh:{uf}:{cidadeNormalizada}:{fast|deep}`.
- Camadas: `Map` em memória + `sessionStorage` (expira ao recarregar a página).
- Hit no cache dispara `onProgress` imediatamente.

### Progresso em tempo real
- `fetchAllNeighborhoods(uf, city, { deep, onProgress })` chama `onProgress(snapshot)` a cada chunk concluído (após IBGE e após cada lote do ViaCEP).
- O modal mantém estado vivo da lista crescente.

## UX no modal (`NeighborhoodSelectorModal.tsx`)

- Texto de status: `"Buscando bairros... {n} encontrados"` enquanto roda.
- Ao concluir: `"{n} bairros encontrados (IBGE + ViaCEP)"`.
- Botão **"Buscar mais bairros"** habilitado após a 1ª busca → dispara `fetchAllNeighborhoods(..., { deep: true })`, mantém os já encontrados e adiciona novos. Mostra `"Varredura completa: {n} bairros"` ao terminar.
- Lista cresce em tempo real (não bloqueia interação com filtro/seleção).
- `selectAll` / `deselectAll` continuam operando sobre a lista atual.

## Arquivos alterados

- `src/hooks/use-ibge-lookup.ts`
  - Adicionar: `normalizeKey`, `withRetry`, `runInChunks`, `fetchMunicipioId`, `fetchIBGEDistricts`, cache em mem+sessionStorage.
  - Reescrever `fetchAllNeighborhoods(uf, city, { deep?, onProgress? })` combinando IBGE + ViaCEP em chunks com progresso.
  - Manter `searchStreetByName` (usado por `NeighborhoodCombobox`).
- `src/components/delivery/settings/NeighborhoodSelectorModal.tsx`
  - Estado de progresso (`foundCount`, `isDeepRunning`, `hasDeepRun`).
  - Passar `onProgress` ao hook; renderizar contador vivo; botão "Buscar mais bairros".
  - Pré-seleção continua marcando os bairros recém-descobertos junto com `existingNeighborhoods`.

## Sem mudanças no banco

Nada de migração — apenas melhora a fonte de dados de bairros consumida no modal de cobertura. Persistência em `delivery_settings` permanece igual.
