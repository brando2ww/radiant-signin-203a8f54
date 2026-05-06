## Diagnóstico

Os grupos "Complete Sua Experiência!!!" e "Extras 'quantidades extras do que acompanha'" continuam aparecendo no cardápio do delivery porque ainda existem como `pdv_product_options` no PDV (produto Sushi Mix 22 Peças, ID `f8cc24f5-7bc6-426c-80e8-dd70e2dc3e87`):

- `9a61dd44-...` → Complete Sua Experiência!!!
- `4caeeea2-...` → Extras "quantidades extras do que acompanha".

A composição correta (apenas Adicional + Doces) está em `pdv_product_composition_groups`, mas as opções antigas não foram removidas. Como o trigger sincroniza ambos para `delivery_product_options`, o cardápio mostra os 4 grupos.

Verifiquei outros produtos que têm o mesmo problema (composição + opções antigas coexistindo):
- Sushi Mix 22 Peças (2 opções antigas)
- Sushi Prime 16 Peças + Temaki (1 opção antiga)
- Entrecot Gelhado Combo (2 opções antigas)

## Plano

Migration SQL para deletar as `pdv_product_options` antigas desses produtos que já foram migrados para composição. A exclusão em cascata removerá automaticamente:
- `pdv_product_option_items` (itens das opções no PDV)
- `delivery_product_options` correspondentes (via trigger de sync DELETE)
- `delivery_product_option_items` filhos

Critério de exclusão: opções de PDV pertencentes a produtos que já possuem `pdv_product_composition_groups`.

```sql
DELETE FROM public.pdv_product_options o
WHERE EXISTS (
  SELECT 1 FROM public.pdv_product_composition_groups g
  WHERE g.parent_product_id = o.product_id
);
```

Após isso, o cardápio do delivery passará a mostrar apenas os grupos vindos da composição (Adicional, Doces).

Sem alterações de frontend.