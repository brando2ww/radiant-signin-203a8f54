# Impressão duplicada de delivery — dedup definitivo no banco

## Diagnóstico (confirmado)

O pedido #006 (21/05/2026 19:28) gerou **2 jobs idênticos** em `pdv_print_jobs` com 152 ms de diferença, ambos para o mesmo `source_item_id`, mesmo centro e mesma impressora.

Isso aconteceu porque há **múltiplos clientes legítimos** (operadores em abas/dispositivos diferentes, todos logados na mesma conta) rodando o `useDeliveryOrdersWatcher`. Cada um recebe o evento Realtime do `INSERT` em `delivery_orders` e dispara `dispatchDeliveryPrintJobs`.

O dedup atual está na aplicação (`SELECT` → `INSERT` em `src/lib/delivery-print.ts`) e não é atômico: dois clientes fazem o `SELECT` quase ao mesmo tempo, ambos veem "vazio" e ambos inserem.

**Múltiplos operadores é cenário normal e desejado.** O sistema é que precisa garantir um único job por pedido/centro, independente de quantos clientes estejam ouvindo.

## Correção

Mover o dedup para o **banco**, onde ele é atômico por definição.

### 1. Migration — limpar duplicados antigos e criar índice único parcial

```sql
-- 1) Remove jobs duplicados existentes (mantém o mais antigo)
DELETE FROM public.pdv_print_jobs a
USING public.pdv_print_jobs b
WHERE a.source_kind = 'delivery'
  AND b.source_kind = 'delivery'
  AND a.source_item_id IS NOT NULL
  AND a.source_item_id = b.source_item_id
  AND a.center_id IS NOT DISTINCT FROM b.center_id
  AND a.created_at > b.created_at;

-- 2) Índice único parcial: 1 job por (item, centro) para delivery automático
CREATE UNIQUE INDEX IF NOT EXISTS pdv_print_jobs_delivery_item_center_uniq
  ON public.pdv_print_jobs (source_item_id, center_id)
  WHERE source_kind = 'delivery' AND source_item_id IS NOT NULL;
```

O índice inclui `center_id` para preservar o agrupamento legítimo por centro (ex.: cozinha + bar imprimem separadamente para o mesmo item).

### 2. Ajuste em `src/lib/delivery-print.ts`

- Manter o `SELECT` pré-INSERT como fast-path (otimiza o caso comum).
- Tratar erro `23505` (unique_violation) do `INSERT` como **sucesso silencioso**: significa que outro cliente ganhou a corrida — o job já existe, nada a fazer.
- Quando `jobs === 0`, o watcher já não exibe toast de "impressão enviada" — comportamento atual preservado.

### 3. Reimpressão manual continua funcionando

Reimpressão (`useReprintOrder`, com `auto !== true`) precisa criar um **novo** job toda vez. Para não colidir com o índice único, reimpressões manuais passarão a inserir com `source_item_id = NULL` (sinalizando "job manual, não dedup-ável"). O conteúdo do payload é idêntico e a print-bridge não depende de `source_item_id` para imprimir.

## Por que essa abordagem

- **Atômica**: o banco garante unicidade — nenhuma combinação de timing ou número de clientes pode burlar.
- **Sem regressão**: o agrupamento por centro continua igual; só impede o duplicado bit-a-bit.
- **Compatível com multi-operador**: que é o uso normal do sistema.
- **Reimpressão preservada**: marcador `source_item_id = NULL` libera reimpressão sem perder rastreabilidade (o `payload` mantém `customer_name`, `order_number`, etc.).

## Arquivos afetados

- `supabase/migrations/<timestamp>_dedupe_delivery_print_jobs.sql` (novo)
- `src/lib/delivery-print.ts` (tratar `23505`; `source_item_id = NULL` em reimpressão manual)

## Fora de escopo

- Trigger de cascata salão↔caixa (assunto anterior).
- Refatorar o watcher para ter um único "leader" entre abas (complexidade desnecessária se o banco já garante unicidade).
