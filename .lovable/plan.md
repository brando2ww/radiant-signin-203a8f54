## Problema

No produto **Sushi Mix 22 Peças** (e potencialmente em outros), o cardápio público do delivery está mostrando 4 grupos:

- `Complete Sua Experiência!!!` (órfão)
- `Extras "quantidades extras do que acompanha".` (órfão)
- `Adicional` (correto — vem do grupo de composição PDV)
- `Doces` (correto — vem do grupo de composição PDV)

Ao consultar o banco, confirmei que as duas primeiras entradas em `delivery_product_options` apontam, via `source_pdv_option_id`, para registros que **não existem mais** em `pdv_product_options` nem em `pdv_product_composition_groups`. Ou seja, são resquícios de opções antigas que foram excluídas no PDV antes do trigger de sincronização cobrir o `DELETE`, ou da época em que elas eram cadastradas como "opções/complementos" no PDV (antes da migração para grupos de composição).

O trigger atual `sync_pdv_option_to_delivery` só apaga em cascata quando o `DELETE` passa por ele agora — registros já deletados antes ficaram órfãos e seguem aparecendo no cardápio.

## Correção

### 1. Migração SQL (limpeza + reforço)

Criar uma migração que:

- **Remove órfãos existentes** em `delivery_product_options`:
  ```sql
  DELETE FROM public.delivery_product_options dpo
  WHERE dpo.source_pdv_option_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.pdv_product_options o      WHERE o.id = dpo.source_pdv_option_id)
    AND NOT EXISTS (SELECT 1 FROM public.pdv_product_composition_groups g WHERE g.id = dpo.source_pdv_option_id);
  ```
  (o `ON DELETE CASCADE` em `delivery_product_option_items.option_id` cuida dos itens filhos)

- **Remove itens órfãos** vindos de `pdv_product_option_items` / `pdv_product_compositions` já deletados:
  ```sql
  DELETE FROM public.delivery_product_option_items dpoi
  WHERE dpoi.source_pdv_option_item_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.pdv_product_option_items i WHERE i.id = dpoi.source_pdv_option_item_id)
    AND NOT EXISTS (SELECT 1 FROM public.pdv_product_compositions c WHERE c.id = dpoi.source_pdv_option_item_id);
  ```

- **Reforça os triggers de DELETE**: garantir que os triggers `sync_pdv_option_to_delivery`, `sync_pdv_option_item_to_delivery`, `sync_pdv_composition_group_to_delivery` e `sync_pdv_composition_to_delivery` estejam ativos `AFTER INSERT OR UPDATE OR DELETE` (já estão, mas recriamos para confirmar).

### 2. Sem alterações no frontend

O `ProductDetailModal` lê corretamente `delivery_product_options`. A causa é só dado órfão no banco. Após a limpeza, o cardápio mostrará apenas `Adicional` e `Doces`.

## Resultado esperado

No cardápio público, o produto Sushi Mix 22 Peças passará a exibir apenas os dois grupos de composição (`Adicional` e `Doces`), e o problema não voltará a ocorrer para futuras exclusões.
