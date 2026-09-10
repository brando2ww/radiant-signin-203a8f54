-- Link público do PEDIDO DE COMPRA para o fornecedor vencedor.
--
-- O modelo aprovado na Meta não comporta a lista de itens: parâmetro não aceita
-- quebra de linha e estoura em ~1024 caracteres, então o pedido chegava como uma
-- linha corrida de vírgulas. Agora a mensagem leva um botão para esta página, que
-- mostra a relação inteira e recebe a confirmação do fornecedor.
--
-- `public_token` é separado do `id` de propósito: endereço público não expõe
-- chave interna e pode ser trocado sem mexer no pedido.

alter table public.pdv_purchase_orders
  add column if not exists public_token uuid not null default gen_random_uuid(),
  -- Quando o fornecedor abriu o link. Serve para o comprador saber se a mensagem
  -- chegou de fato antes de cobrar por telefone.
  add column if not exists supplier_viewed_at timestamptz,
  add column if not exists supplier_confirmed_at timestamptz,
  -- Recado que o fornecedor deixa ao confirmar ("entrego terça de manhã").
  add column if not exists supplier_note text;

create unique index if not exists pdv_purchase_orders_public_token_key
  on public.pdv_purchase_orders (public_token);

comment on column public.pdv_purchase_orders.public_token is
  'Token do link público /pedido/:token enviado ao fornecedor no WhatsApp.';
