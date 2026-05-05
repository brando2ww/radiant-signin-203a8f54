## Impressão por centro de produção em pedidos de delivery

Replicar no delivery o mesmo fluxo já usado no salão: ao confirmar o pedido, gerar **um job de impressão por centro de produção** envolvido, enfileirado em `pdv_print_jobs` (mesma fila que o PrintBridge já consome).

### 1. Migração de banco

```sql
-- vínculo do item ao centro de produção
ALTER TABLE public.delivery_order_items
ADD COLUMN IF NOT EXISTS production_center_id uuid REFERENCES public.pdv_production_centers(id);

CREATE INDEX IF NOT EXISTS idx_delivery_order_items_center
  ON public.delivery_order_items(production_center_id);

-- aceitar 'delivery' como source_kind na fila já existente
ALTER TABLE public.pdv_print_jobs
DROP CONSTRAINT IF EXISTS pdv_print_jobs_source_kind_check;
ALTER TABLE public.pdv_print_jobs
ADD CONSTRAINT pdv_print_jobs_source_kind_check
CHECK (source_kind = ANY (ARRAY['comanda','order','delivery']));

-- view de snapshot p/ montar o payload do PrintBridge
CREATE OR REPLACE VIEW public.vw_print_bridge_delivery_items AS
SELECT oi.id, oi.order_id, oi.production_center_id,
       oi.product_name, oi.quantity, oi.notes,
       pc.name AS center_name, pc.printer_ip, pc.printer_port,
       o.order_number, o.customer_name, o.customer_phone,
       o.order_type, o.delivery_address_text,
       o.user_id AS tenant_user_id
FROM public.delivery_order_items oi
JOIN public.delivery_orders o ON o.id = oi.order_id
LEFT JOIN public.pdv_production_centers pc ON pc.id = oi.production_center_id;
```

### 2. Resolver `production_center_id` na criação do pedido

Em `src/hooks/use-delivery-customers.ts` (`useCreateOrder`), após inserir os itens, resolver o centro de produção de cada `product_id` reutilizando a mesma regra do salão:

- `delivery_products.source_pdv_product_id` → `pdv_products.printer_station` (slug) → `pdv_production_centers` ativo do tenant.
- Atualizar cada `delivery_order_items.production_center_id` em batch.

### 3. Serviço compartilhado de despacho

Criar `src/lib/delivery-print.ts` exportando `dispatchDeliveryPrintJobs(orderId)`:

- Busca `vw_print_bridge_delivery_items` filtrando pelo `order_id`.
- Agrupa por `(production_center_id, printer_ip, printer_port)`.
- Insere um registro por grupo em `pdv_print_jobs` com `source_kind='delivery'` e `payload`:
  ```json
  {
    "kind": "delivery",
    "mesa_numero": "DELIVERY",
    "comanda_nome": "<nome do cliente>",
    "comanda_number": "<order_number>",
    "customer_name": "...",
    "customer_phone": "...",
    "delivery_address": "...",
    "items": [{ "product_name", "quantity", "notes" }]
  }
  ```
- Cada centro só recebe seus próprios itens (cozinha não vê o que é do bar).
- Status `pending` se houver `printer_ip`, senão `failed` com `error_message`.

O PrintBridge já lê dessa fila e formata o cabeçalho a partir de `mesa_numero` — usar `"DELIVERY"` faz sair em destaque no lugar do número da mesa, exatamente como pedido.

### 4. Disparo no momento do "confirmado"

Em `src/hooks/use-delivery-orders.ts`, dentro de `useUpdateOrderStatus`, quando `status === "confirmed"`:

- Após `consume_ingredients_for_delivery_order`, chamar `await dispatchDeliveryPrintJobs(id)`.
- Falhas no print não bloqueiam a transição de status (apenas `console.error` + toast leve).

### 5. Reimpressão

Adicionar botão "Reimprimir" em `src/components/delivery/OrderDetailDialog.tsx`:

- Aciona `dispatchDeliveryPrintJobs(order.id)` novamente — gera nova leva de jobs por centro.
- Opcional: dropdown com a lista de centros distintos do pedido para reimprimir só um.

### 6. Tipos

Adicionar `production_center_id?: string | null` em `DeliveryOrderItem` (`use-delivery-orders.ts`).

### Arquivos alterados / criados

- `supabase/migrations/<timestamp>_delivery_print_by_center.sql` (novo — via tool de migração)
- `src/lib/delivery-print.ts` (novo — dispatcher)
- `src/hooks/use-delivery-customers.ts` (resolver centro nos itens criados)
- `src/hooks/use-delivery-orders.ts` (disparar prints ao confirmar; tipo)
- `src/components/delivery/OrderDetailDialog.tsx` (botão Reimprimir)

### O que é reutilizado

- Fila `pdv_print_jobs` e o agente PrintBridge — sem mudanças.
- Mapeamento produto → `printer_station` → centro de produção — inalterado.
- Lógica de agrupamento por `(centro, impressora)` — espelhada da implementada em `use-pdv-comandas.ts` (`sendToKitchenMutation`).
