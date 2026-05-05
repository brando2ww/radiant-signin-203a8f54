
## Objetivo

Garantir que toda impressão (cozinha, pré-conta, recibo) exiba **MESA** em destaque máximo e o nome da comanda logo abaixo, e que comandas avulsas sejam internamente vinculadas a uma mesa virtual "Balcão".

## 1. Banco — mesa virtual "Balcão" + view com table_number

Migration:

- Adicionar coluna `is_virtual boolean default false` em `pdv_tables` (para identificar mesas internas que não aparecem no salão).
- Adicionar coluna `counter_table_name text default 'Balcão'` em `pdv_settings` (configurável).
- Trigger `pdv_ensure_counter_table()` em INSERT/UPDATE de `pdv_settings`: garante que exista uma `pdv_tables` com `is_virtual=true`, `table_number = counter_table_name`, `status='livre'` para o owner. Também executar para todos os owners existentes via UPDATE no migration.
- **Atualizar a view `vw_print_bridge_comanda_items`** para incluir `o.table_id`, `t.table_number` e `t.is_virtual` (hoje só a view de orders tem). LEFT JOIN em `pdv_orders o ON o.id = c.order_id` e `pdv_tables t ON t.id = o.table_id`. Manter `security_invoker=false` e GRANT SELECT.

## 2. Atrelar comanda avulsa à mesa "Balcão"

Em `src/hooks/use-pdv-comandas.ts` `createComandaMutation`:

- Se `data.orderId` for nulo, antes do INSERT da comanda:
  1. Buscar a mesa virtual do owner (`pdv_tables` com `is_virtual=true`).
  2. Se houver uma `pdv_orders` aberta para essa mesa, reusar; senão criar uma nova `pdv_orders` (source `salao`/`balcao`, status `aberto`) apontando para essa mesa e marcar `current_order_id` na mesa.
  3. Setar `data.orderId` para esse order.
- Comanda avulsa passa a ter `order_id` válido vinculado à mesa "Balcão", sem alterar a UX do salão (mesa virtual oculta nas listagens via filtro `is_virtual=false`).
- Filtrar `is_virtual=true` em listagens de mesas (`use-pdv-tables`, mapa do salão, etc.) para que ela não apareça visualmente para o garçom.

## 3. Payload PrintBridge — campos novos

Em `use-pdv-comandas.ts` `sendToKitchenMutation`, ao montar `jobs[].payload` adicionar:

```ts
payload: {
  mesa_numero: first.is_virtual
    ? (first.table_number || 'Balcão')   // virtual → exibido em caixa alta
    : (first.table_number ?? null),
  comanda_nome: first.customer_name || `Comanda ${first.comanda_number}`,
  is_counter: !!first.is_virtual,
  comanda_number: first.comanda_number,
  customer_name: first.customer_name,
  kind: 'comanda',
  items: [...]
}
```

Fallback: se `mesa_numero` ausente → `"AVULSA"`; se `comanda_nome` ausente → `Comanda #<order_number>`.

## 4. PrintBridge — `buildReceipt` com hierarquia

Em `print-bridge/server.js`:

- Substituir o header atual por um cabeçalho hierárquico:
  - Linha do nome do estabelecimento (como hoje).
  - `================================`
  - **Mesa em destaque**: `GS ! 0x77` (largura+altura ~3x), centralizado, texto: `MESA ${mesa_numero}` (ou `BALCÃO` quando `is_counter` for `true` ou `mesa_numero` for "Balcão"). Usar `String(mesa_numero).toUpperCase()`. Se ausente → `AVULSA`.
  - **Comanda menor**: `GS ! 0x11` (tamanho médio), centralizado, texto: `comanda_nome`.
  - `================================`
  - Linha auxiliar com Centro/Comanda#/Pedido# em fonte normal (mantém info hoje exibida).
  - Data/hora.
- Body de itens permanece igual.
- Manter retrocompatibilidade: se `mesa_numero` não vier no payload, derivar do antigo `table_number`/`customer_name`.

## 5. Pré-conta e recibo de pagamento

Em `src/lib/print-fiscal-receipt.ts` `printNonFiscalReceipt`:

- Trocar `identifier: string` por `header: { mesa: string; comanda: string }` (manter `identifier` como retrocompat opcional).
- Renderizar no topo:
  ```html
  <div class="center bold" style="font-size:22px">MESA {mesa}</div>
  <div class="center bold" style="font-size:14px">{comanda}</div>
  ```
- Em `PaymentDialog.tsx` `handlePrintNonFiscal`, calcular:
  - `mesa = isTablePayment ? formatTableLabel(table.table_number).replace(/^Mesa\s*/i,'') : (selectedComanda?.table_number || 'BALCÃO')`
  - `comanda = comanda?.customer_name || 'Comanda #' + comanda?.comanda_number` (ou `Mesa` para pagamento de mesa).

(Não há fluxo de "pré-conta" separado hoje; quando for adicionado, deve usar o mesmo helper.)

## 6. Configurações do PDV (UI)

Em `src/hooks/use-pdv-settings.ts` adicionar `counter_table_name?: string` na interface. Em `src/pages/pdv/Settings.tsx` (aba operacional) incluir um input "Nome da mesa virtual de balcão" (default `Balcão`), persistindo em `pdv_settings.counter_table_name`. O trigger renomeia a mesa virtual ao salvar.

## Detalhes técnicos

```text
+------------------+        +-------------------+
| pdv_comandas     |        | pdv_orders        |
| order_id (NN)*   |------->| table_id (NN)*    |
+------------------+        +---------+---------+
                                      |
                                      v
                            +---------+---------+
                            | pdv_tables        |
                            | is_virtual=true   |
                            | table_number=     |
                            |   counter_name    |
                            +-------------------+
*NN = sempre preenchido após esta mudança
```

Regra: **nenhum INSERT em `pdv_print_jobs` sem `payload.mesa_numero` e `payload.comanda_nome`**. Garantido em código (e fallback "AVULSA"/`Comanda #<n>`).

## Arquivos

- `supabase/migrations/<new>.sql` — coluna `is_virtual`, coluna `counter_table_name`, trigger de garantia, recriação da view `vw_print_bridge_comanda_items`.
- `src/hooks/use-pdv-comandas.ts` — auto-vínculo à mesa Balcão + payload novo.
- `src/hooks/use-pdv-tables.ts` — filtrar `is_virtual=false` por padrão.
- `src/hooks/use-pdv-settings.ts` — `counter_table_name`.
- `src/pages/pdv/Settings.tsx` — campo de configuração.
- `print-bridge/server.js` — `buildReceipt` com hierarquia MESA / comanda.
- `src/lib/print-fiscal-receipt.ts` — header hierárquico.
- `src/components/pdv/cashier/PaymentDialog.tsx` — passar mesa/comanda ao recibo.
