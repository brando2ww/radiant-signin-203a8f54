# Lançar prêmio "manual" em comanda escolhendo o produto

Hoje o botão "Lançar prêmio em comanda" só aparece para `reward_type === "free_product"` com `reward_product_id`. Para prêmios manuais (como "01 Drink Sugestão") só aparece "Marcar como resgatado" — exatamente o problema do usuário.

## Mudança

No `RedeemCouponDialog.tsx`, **sempre** mostrar o fluxo "Lançar em comanda" quando o cupom estiver `active`, exceto quando for desconto puro (`percent`/`fixed`) em modo standalone (esses são aplicados no `PaymentDialog`).

### Comportamento por tipo de prêmio

| reward_type | Produto a lançar |
|---|---|
| `free_product` com `reward_product_id` | usa o produto vinculado (igual hoje) |
| `free_product` sem vínculo / `manual` | **operador escolhe** um produto do catálogo |
| `percent` / `fixed` (standalone) | continua só "Marcar como resgatado" + dica para aplicar no pagamento |

### UI

Quando o operador clica "Lançar prêmio em comanda":
1. Select de **comanda aberta** (já existe).
2. Se não há produto pré-definido → adicionar **Combobox/Select de produto** acima. Carrega produtos do tenant (`pdv_products` ativos, `is_available=true`), com input de busca local (sem fetch a cada tecla).
3. Botão **Confirmar** desabilitado até ter comanda + produto.
4. No submit: `useLaunchCouponOnComanda` recebe o `productId` escolhido (já aceita esse parâmetro), insere item cortesia R$ 0 com nota `Cortesia — Cupom XXX (NomeDoPrêmio)` e marca resgatado.

## Arquivos

### `src/components/pdv/cashier/RedeemCouponDialog.tsx`
- Trocar a condição `canLaunch` para: `result.reward_type !== "percent" && result.reward_type !== "fixed"` (ou `mode === "standalone"`).
- Adicionar estado `selectedProductId` (default = `reward_product_id` quando existir).
- Quando `reward_product_id` ausente, renderizar Select com a lista de produtos.
- Adicionar query inline `useQuery(["pdv-products-for-coupon", visibleUserId], ...)` que busca `id, name, price` de `pdv_products` ativos do tenant (limit razoável, ex. 500), habilitada só quando `showLaunch && !reward_product_id`.
- Passar `selectedProductId` em vez de `reward_product_id` no `launch.mutate`.

### Hook
Sem mudança — `useLaunchCouponOnComanda` já recebe `productId` arbitrário.

## Fora de escopo
- Não cria produto "Cortesia" automaticamente.
- Não toca em `PaymentDialog`.
- Não muda fluxo de desconto.
