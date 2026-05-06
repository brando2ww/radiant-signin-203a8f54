## Diagnóstico

Quando produtos da composição (Kits/Combos) são clonados como `delivery_product_option_items`, o `price_adjustment` é gravado fixo em `0`. Por isso os adicionais aparecem sem valor no cardápio do delivery e não somam ao total.

A função `delivery_clone_options_from_pdv` e o trigger `sync_pdv_composition_to_delivery` fazem:
```
INSERT ... (..., price_adjustment, ...) VALUES (..., 0, ...)
```

Deveria pegar o preço de delivery do `child_product` (`price_delivery` ou `price_salon` como fallback), multiplicado pela `quantity` da composição.

## Plano

Migration SQL:

1. Atualizar a função `sync_pdv_composition_to_delivery` para calcular `price_adjustment` a partir do produto filho:
   ```
   price = COALESCE(p.price_delivery, p.price_salon, 0) * COALESCE(NEW.quantity, 1)
   ```
   Aplicar tanto no INSERT quanto no UPDATE.

2. Atualizar a função `delivery_clone_options_from_pdv` na seção de composição para o mesmo cálculo.

3. Backfill: atualizar `delivery_product_option_items` existentes cujos `source_pdv_option_item_id` correspondam a `pdv_product_compositions`, recalculando `price_adjustment` com base no `child_product`.

Sem alterações de frontend (o componente já lê `price_adjustment`).