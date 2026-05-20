
## Problema

`delivery_coupons.usage_count` não é atualizado por ninguém. Os pedidos do delivery são inseridos com `coupon_code` preenchido, mas nada incrementa o contador. Resultado: a barra "1/10000 usados" no painel está errada — pedidos reais (consultados em `delivery_orders`):

| Código    | usage_count atual | Pedidos reais (não cancelados) |
|-----------|------------------:|-------------------------------:|
| KOTEN12   | 1                 | 49                             |
| KOTEN20   | 5                 | 111                            |
| KOTEN10   | 1                 | 1                              |

## Solução

Manter `usage_count` como fonte da verdade (já é usado em UI e na validação do cupom no checkout) e garantir que ele acompanhe os pedidos. Tudo via migração SQL, sem mexer no código de criação de pedido.

### 1. Trigger em `delivery_orders`

Função `public.sync_coupon_usage_count()` com `SECURITY DEFINER` + `search_path = public`:

- **AFTER INSERT**: se `NEW.coupon_code IS NOT NULL` e `NEW.status <> 'cancelled'` → `UPDATE delivery_coupons SET usage_count = usage_count + 1 WHERE user_id = NEW.user_id AND code = NEW.coupon_code`.
- **AFTER UPDATE**: se `coupon_code` mudou, decrementar o antigo (se não estava cancelado) e incrementar o novo. Se só o `status` mudou:
  - de não-cancelado → `cancelled`: decrementar.
  - de `cancelled` → não-cancelado: incrementar.
- **AFTER DELETE**: se tinha `coupon_code` e não estava cancelado → decrementar.

Decremento usa `GREATEST(usage_count - 1, 0)` para nunca ir negativo.

Trigger: `trg_sync_coupon_usage_count` em `delivery_orders` para INSERT/UPDATE/DELETE.

### 2. Backfill

Único `UPDATE` recomputando `usage_count` a partir de `delivery_orders`:

```sql
UPDATE delivery_coupons c
SET usage_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT user_id, coupon_code, COUNT(*) AS cnt
  FROM delivery_orders
  WHERE coupon_code IS NOT NULL AND status <> 'cancelled'
  GROUP BY user_id, coupon_code
) sub
WHERE c.user_id = sub.user_id AND c.code = sub.coupon_code;
```

Cupons sem nenhum pedido continuam com seu valor atual (provavelmente 0 — não há risco de corromper).

## Não inclui

- Não muda código de aplicação. A UI já lê `usage_count` da tabela e refletirá automaticamente.
- Não altera o validador de carrinho (que já compara `usage_count >= usage_limit`).

## Arquivos

- 1 migração nova: função + trigger + backfill em um único bloco.
