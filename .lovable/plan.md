## Problema

Hoje as impressões nos centros de produção do delivery saem só com o `product_name` e `quantity`. Os adicionais escolhidos pelo cliente (registrados em `delivery_order_item_options`) não aparecem na impressão da cozinha/bar, ao contrário do que já ocorre no salão (que envia `modifiers` no payload).

A `print-bridge` (`print-bridge/server.js`) já sabe imprimir `modifiers` no formato `+ Nome` — só não está recebendo os dados.

## Causa

1. A view `vw_print_bridge_delivery_items` retorna só os campos básicos do `delivery_order_items`, sem juntar com `delivery_order_item_options`.
2. `src/lib/delivery-print.ts` (`dispatchDeliveryPrintJobs`) monta `items` sem campo `modifiers`.

## Mudanças

### 1. Migração SQL — recriar a view com os adicionais agregados

`vw_print_bridge_delivery_items` passa a expor uma coluna nova `options` (JSON), agregando os adicionais de cada item:

```sql
DROP VIEW IF EXISTS public.vw_print_bridge_delivery_items;
CREATE VIEW public.vw_print_bridge_delivery_items AS
SELECT
  oi.id,
  oi.order_id,
  oi.production_center_id,
  oi.product_name,
  oi.quantity,
  oi.notes,
  pc.name AS center_name,
  pc.printer_ip,
  pc.printer_port,
  o.order_number,
  o.ticket_number,
  o.customer_name,
  o.customer_phone,
  o.order_type,
  o.delivery_address_text,
  o.user_id AS tenant_user_id,
  COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'name', oio.item_name,
        'option_name', oio.option_name,
        'quantity', oio.quantity
      ) ORDER BY oio.option_name, oio.item_name
    )
    FROM public.delivery_order_item_options oio
    WHERE oio.order_item_id = oi.id
  ), '[]'::jsonb) AS options
FROM public.delivery_order_items oi
JOIN public.delivery_orders o ON o.id = oi.order_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = oi.production_center_id;

GRANT SELECT ON public.vw_print_bridge_delivery_items TO anon, authenticated;
```

### 2. `src/lib/delivery-print.ts`

No `payload.items.map(...)`, incluir `modifiers` derivado de `r.options`:

```ts
items: groupItems.map((r: any) => ({
  product_name: r.product_name,
  quantity: r.quantity,
  notes: r.notes,
  modifiers: Array.isArray(r.options)
    ? r.options.map((o: any) => ({
        name: o.quantity > 1 ? `${o.quantity}x ${o.name}` : o.name,
      }))
    : [],
})),
```

A `print-bridge` já renderiza esses `modifiers` como `+ Nome` logo após o item, então o ticket da cozinha passará a mostrar:

```
1x SUSHI MIX 22 PEÇAS
  + 8x Hot Doce
  + 4x Hot Holl Banana com Nutella
```

## Fora de escopo

- Não mexe na rota dos adicionais por centro (continuam no centro do item-pai). Caso futuramente queira que cada adicional vá ao seu próprio centro, é outra issue.
