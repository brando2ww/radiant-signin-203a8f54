## Problema

A varredura está parando em "1000/6000 CEPs · 1 bairros". Isso acontece porque a função, após varrer o primeiro prefixo (95720), reaproveita o cache local dos prefixos seguintes — mas o cache de prefixos antigos (do teste anterior) está vazio/incompleto, fazendo o progresso pular instantaneamente sem efetivamente buscar.

Você pediu: **sempre começar do zero**, sem reaproveitar cache.

## Mudança

### `src/hooks/use-cep-range-sweep.ts`

Remover o bloco `if (cached) { ... continue; }` dentro do laço `outer:` em `sweepCepRange`. Cada prefixo passa a ser varrido integralmente sempre que o usuário clicar em "Varrer".

O cache continua sendo **escrito** ao final de cada prefixo (útil para outras leituras como `getCachedSweep` no auto-load do modal), mas a varredura ativa nunca o lê para pular trabalho.

### Opcional — limpar cache antigo no clique

Em `handleStartSweep` (`NeighborhoodSelectorModal.tsx`), antes de iniciar, fazer `localStorage.removeItem("cep-sweep:{prefix}")` para cada prefixo na faixa, garantindo estado limpo.

## Sem mudanças

- UI da modal permanece igual.
- Bairros manuais e cache de bairros manuais não são afetados.
