## Problema

No cardápio público de delivery (onde o cliente pede), os adicionais/composições mostram:
- **Preço sempre +R$ 0,00**, mesmo que no Administrador → Produtos o sub-produto tenha preço (ex.: Shoyo Sache R$ 2,00).
- **Quantidade fixa em 0/1** sem o stepper +/− mesmo quando o grupo no PDV tem "Permitir múltiplas unidades por item" ligado.

Causa: as triggers que sincronizam PDV → delivery não copiam `allow_quantity` e o `price_adjustment` dos itens de composição só é calculado quando a linha de composição (`pdv_product_compositions`) é alterada — quando o lojista muda só o **preço do produto-filho** (`pdv_products.price_delivery/price_salon`), os `delivery_product_option_items` ficam desatualizados (R$ 0,00 herdado da criação inicial, antes do preço existir).

## Solução (migrations SQL)

### 1. Propagar `allow_quantity` PDV → Delivery
- `sync_pdv_composition_group_to_delivery`: incluir `allow_quantity` no INSERT e no UPDATE.
- `sync_pdv_option_to_delivery`: idem para opções tradicionais.
- `delivery_clone_options_from_pdv`: incluir `allow_quantity` ao clonar grupos e opções.
- **Backfill**: atualizar `delivery_product_options.allow_quantity` a partir do `pdv_product_composition_groups.allow_quantity` (via `source_pdv_option_id`) e de `pdv_product_options.allow_quantity`.

### 2. Recalcular `price_adjustment` quando o preço do produto-filho mudar
- Nova trigger `sync_pdv_product_price_to_composition` em `pdv_products` (AFTER UPDATE OF price_delivery, price_salon):
  - Para cada `pdv_product_compositions` onde `child_product_id = NEW.id`, atualiza todos os `delivery_product_option_items` ligados (`source_pdv_option_item_id = c.id`) com:
    `price_adjustment = COALESCE(NEW.price_delivery, NEW.price_salon, 0) * COALESCE(c.quantity, 1)`.
- **Backfill**: roda o mesmo recálculo uma vez para todos os itens já existentes (similar ao backfill que já foi feito no migration `20260506175343`, mas re-executado para pegar preços que mudaram depois).

### 3. (Opcional) Recalcular quando a composição muda de quantidade
A trigger `sync_pdv_composition_to_delivery` já faz isso — sem alteração necessária.

## Resultado

Após aprovação:
- O modal de detalhes do produto público (`ProductDetailModal`) já lê `allow_quantity` de `delivery_product_options` e renderiza o stepper +/− automaticamente.
- Os preços +R$ X,XX aparecerão corretamente nos adicionais/sub-produtos.
- Editar preço ou flag no Administrador → Produtos reflete imediatamente no cardápio público sem precisar tocar nada em Delivery → Cardápio.

## Detalhes técnicos

Arquivos: apenas 1 migration nova em `supabase/migrations/`. Nenhuma mudança no frontend é necessária — `usePublicProducts` já seleciona `allow_quantity`, e `ProductDetailModal` já trata `allowQty` para renderizar o stepper.
