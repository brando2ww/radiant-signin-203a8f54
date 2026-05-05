## Acelerar varredura de CEPs

Hoje cada prefixo (1000 CEPs) é varrido em chunks de 8 requests paralelos = ~125 rodadas sequenciais. Para 6 prefixos = 750 rodadas. Isso é o gargalo.

## Mudanças em `src/hooks/use-cep-range-sweep.ts`

1. **Aumentar paralelismo**: `CHUNK_SIZE` de 8 → **60**. ViaCEP suporta bem; cada prefixo passa a precisar só ~17 rodadas.
2. **Pular sufixos óbvios**: muitos CEPs `xxx001`–`xxx999` retornam erro. Não dá para pular sem testar, mas podemos:
   - Fazer **early-exit por prefixo**: se nos primeiros 200 CEPs do prefixo não encontrarmos nenhum bairro novo (e o prefixo só responde "Centro"/erro), abortar o restante daquele prefixo. Critério: após 200 CEPs sem nenhuma entry nova, pula para o próximo prefixo.
3. **Timeout por request**: 4s via `AbortController` interno + `Promise.race`, evitando que um CEP travado segure todo o chunk.
4. **Retry leve**: pular retry — falhas individuais já são silenciadas.

## Estimativa

- Antes: ~6000 CEPs / 8 paralelos × ~150ms = ~110s
- Depois: ~60 paralelos + early-exit em prefixos vazios = **~10–20s** para Garibaldi (5 dos 6 prefixos abortam cedo).

## Sem mudanças

- UI, cache, manual neighborhoods e estrutura de retorno permanecem iguais.
- Progress bar continua reportando `done` real.
