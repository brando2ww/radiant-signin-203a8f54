## Reativar busca híbrida IBGE + ViaCEP A–Z no modal de cobertura

O hook `fetchAllNeighborhoods` em `src/hooks/use-ibge-lookup.ts` já implementa exatamente a estratégia descrita (IBGE primeiro, ViaCEP em paralelo com termos + A–Z, dedup normalizada, retry, progress). O problema é que o modal foi trocado para varredura por CEP — vamos reconectá-lo ao hook híbrido e melhorar o cache para 24h com indicador.

## Mudanças

### 1. `src/hooks/use-ibge-lookup.ts`

- Cache: trocar `sessionStorage` (sem TTL) por `localStorage` com TTL de 24h. Chave `neigh-v2:{uf}:{city-normalizado}` armazena `{ list, ts }`.
- Exportar:
  - `readNeighborhoodsCache(uf, city)` → `{ list, ts, fromCache: true } | null` (retorna apenas se < 24h).
  - `clearNeighborhoodsCache(uf, city)` para o botão "Atualizar".
- `fetchAllNeighborhoods`: passar a usar o novo cache; sempre rodar deep (A–Z) — é o que garante a cobertura completa.
- Aumentar paralelismo dos chunks de 6 → 10. Manter `withRetry` (1 retry) e `searchStreetByName` com `AbortController` 4s.

### 2. `src/components/delivery/settings/NeighborhoodSelectorModal.tsx`

- Remover a UI de "Varrer faixa de CEP" (inputs De/Até + botão Varrer + barra de progresso baseada em CEPs).
- Manter:
  - Busca individual por CEP (útil para casos pontuais).
  - Adicionar bairro manualmente (fallback).
  - Lista de bairros com filtro/seleção.
- Adicionar busca automática ao abrir:
  - Se houver cache válido (`readNeighborhoodsCache`), preencher imediatamente e mostrar barra:
    > "Bairros do cache · atualizado há X · [Atualizar]"
  - Se não houver cache, chamar `fetchAllNeighborhoods` em background:
    - Header de status: "Buscando bairros... X encontrados" + spinner.
    - `onProgress` atualiza a lista em tempo real.
    - Após 15s, exibe botão "Parar e usar resultados atuais" (cancela via `AbortController` propagado em nova opção `signal` no hook).
  - Ao terminar: "X bairros encontrados" + botão "Atualizar" para refazer a busca (limpa cache).
- Toast discreto se IBGE falhou ("Lista pode estar incompleta — usando ViaCEP apenas") — já temos fallback graceful no hook.

### 3. `src/hooks/use-cep-range-sweep.ts`

- Marcar como deprecated mas não remover (CepRangeSweepPanel em ExcludedZones ainda usa). A varredura por CEP continua válida para **bloqueios de CEP** em massa em "Exclusões de Entrega" — só não serve para cobrir bairros.

### 4. Suporte a abort no `fetchAllNeighborhoods`

Adicionar parâmetro `signal?: AbortSignal` em `FetchNeighborhoodsOptions` e propagar para os `fetch` internos via `AbortController` por request (com timeout 4s já existente, somar abort externo). Quando abortado, retorna o snapshot atual sem erro.

## UX final

- Abrir modal de Garibaldi/RS:
  - Distritos do IBGE aparecem em ~1s (Garibaldi tem distritos cadastrados).
  - ViaCEP A–Z roda em paralelo, lista cresce em tempo real.
  - ~10–20s para conclusão; depois disso, abrir o modal é instantâneo (cache 24h).
- Botão "Atualizar" sempre visível para forçar nova busca.
- Bairro manual e busca por CEP individual continuam disponíveis como fallback.

## Não inclui

- Não toca a UI de exclusões por faixa de CEP (continua usando `sweepCepRange`).
- Não muda schema do banco.
