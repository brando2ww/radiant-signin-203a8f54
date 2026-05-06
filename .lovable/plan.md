## Problema

Erro ao salvar grupo de opções no delivery:
`column "updated_at" of relation "delivery_product_options" does not exist`

As funções/triggers de sincronização PDV→delivery (`sync_pdv_composition_group_to_delivery`, `sync_pdv_option_to_delivery`, `delivery_clone_options_from_pdv`) fazem `UPDATE ... SET updated_at = now()`, mas as tabelas `delivery_product_options` e `delivery_product_option_items` não possuem essa coluna.

## Correção

Migração SQL adicionando as colunas e triggers de timestamp:

```sql
ALTER TABLE public.delivery_product_options
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.delivery_product_option_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER trg_delivery_product_options_updated_at
BEFORE UPDATE ON public.delivery_product_options
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trg_delivery_product_option_items_updated_at
BEFORE UPDATE ON public.delivery_product_option_items
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
```

Sem alterações no frontend.
