# Corrigir preço de sub-produtos no Delivery quando price_delivery é zero

## Diagnóstico

Os itens "04 Hot Holl Morango com Nutella" e "04 Hot Holl Banana com Nutella" estão como **+R$ 0,00** no delivery, mas no Editar Produto do administrador aparecem corretamente como **R$ 19,00/un**.

Consultando o banco:
- `pdv_products`: `price_delivery = 0.00`, `price_salon = 19.00`
- `delivery_product_option_items.price_adjustment = 0.00`

A migração anterior usa `COALESCE(price_delivery, price_salon, 0)`. Como `price_delivery = 0` (não NULL), o COALESCE retorna 0 e ignora o price_salon. Já a tela do administrador trata 0 como "sem preço delivery" e mostra o price_salon.

O "08 Hot Doce" funciona porque tem price_delivery = 29,00.

## Correção

Atualizar a lógica de seleção de preço para tratar `0` como ausente, caindo para `price_salon`:

`COALESCE(NULLIF(price_delivery, 0), price_salon, 0)`

### Mudanças (uma migração nova)

1. Recriar a função `sync_pdv_product_price_to_composition` com `NULLIF(price_delivery, 0)`.
2. Re-executar o backfill em `delivery_product_option_items` com a mesma fórmula para corrigir os valores atuais (Hot Holl Morango/Banana passarão a 19,00).

Nenhuma alteração em frontend é necessária — o `ProductDetailModal` já renderiza corretamente o `price_adjustment` vindo do banco.
