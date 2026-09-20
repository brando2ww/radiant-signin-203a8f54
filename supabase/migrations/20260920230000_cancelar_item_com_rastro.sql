-- Cancelamento de item da comanda com rastro.
--
-- Até aqui, remover item era um DELETE direto na linha (removeItemMutation):
-- sem permissão, sem motivo, sem autor e sem rastro. A permissão "Cancelar
-- item" já existia no enum e na tela de Permissões, mas ninguém a consultava, e
-- a auditoria nunca recebeu um único registro de cancelamento de item.
--
-- O item cancelado SAI de pdv_comanda_items e vira uma linha aqui. Manter o
-- cancelado na própria tabela de itens obrigaria a filtrar em toda soma do
-- sistema (subtotal da comanda, pendente, CMV, relatórios, impressão de praça),
-- e é justamente aí que um esquecimento vira dinheiro errado no caixa.

create table if not exists public.pdv_cancelled_comanda_items (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  comanda_id uuid not null,
  order_id uuid,
  -- id que o item tinha, só para amarrar com a auditoria
  item_id uuid not null,
  product_id uuid,
  product_name text not null,
  quantity numeric not null default 0,
  unit_price numeric not null default 0,
  subtotal numeric not null default 0,
  paid_quantity numeric not null default 0,
  kitchen_status text,
  sent_to_kitchen_at timestamptz,
  notes text,
  item_created_at timestamptz,
  cancelled_at timestamptz not null default now(),
  cancelled_by_user_id uuid,
  cancellation_reason text,
  cancellation_category text
);

create index if not exists idx_cancelled_items_owner_data
  on public.pdv_cancelled_comanda_items (owner_user_id, cancelled_at desc);
create index if not exists idx_cancelled_items_comanda
  on public.pdv_cancelled_comanda_items (comanda_id);
create index if not exists idx_cancelled_items_order
  on public.pdv_cancelled_comanda_items (order_id);

alter table public.pdv_cancelled_comanda_items enable row level security;

drop policy if exists "members can read cancelled items" on public.pdv_cancelled_comanda_items;
create policy "members can read cancelled items"
  on public.pdv_cancelled_comanda_items for select
  using (owner_user_id = auth.uid() or public.is_establishment_member(owner_user_id));

-- Escrita só pela função abaixo, que é quem confere a permissão.
drop policy if exists "no direct insert cancelled items" on public.pdv_cancelled_comanda_items;
create policy "no direct insert cancelled items"
  on public.pdv_cancelled_comanda_items for insert
  with check (false);

-- =========================================================
-- RPC: cancelar item da comanda
-- =========================================================
create or replace function public.pdv_cancel_comanda_item(
  p_item_id uuid,
  p_reason text default null,
  p_category text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_item record;
  v_owner uuid;
begin
  select i.id, i.comanda_id, i.product_id, i.product_name, i.quantity, i.unit_price,
         i.subtotal, i.paid_quantity, i.kitchen_status, i.sent_to_kitchen_at,
         i.notes, i.created_at,
         c.user_id as owner_user_id, c.order_id, c.status as comanda_status
    into v_item
  from public.pdv_comanda_items i
  join public.pdv_comandas c on c.id = i.comanda_id
  where i.id = p_item_id;

  if not found then
    raise exception 'Item não encontrado ou já cancelado';
  end if;

  v_owner := v_item.owner_user_id;

  if not (v_owner = v_actor or public.is_establishment_member(v_owner)) then
    raise exception 'Sem acesso a este item';
  end if;

  -- Item já pago é outra permissão, e o garçom nunca a tem.
  if coalesce(v_item.paid_quantity, 0) > 0 then
    if not public.has_pdv_action(v_actor, 'cancel_paid_item') then
      raise exception 'Sem permissão para cancelar item já pago';
    end if;
  elsif not public.has_pdv_action(v_actor, 'cancel_item') then
    raise exception 'Sem permissão para cancelar item';
  end if;

  insert into public.pdv_cancelled_comanda_items (
    owner_user_id, comanda_id, order_id, item_id, product_id, product_name,
    quantity, unit_price, subtotal, paid_quantity, kitchen_status,
    sent_to_kitchen_at, notes, item_created_at,
    cancelled_by_user_id, cancellation_reason, cancellation_category
  ) values (
    v_owner, v_item.comanda_id, v_item.order_id, v_item.id, v_item.product_id, v_item.product_name,
    coalesce(v_item.quantity, 0), coalesce(v_item.unit_price, 0), coalesce(v_item.subtotal, 0),
    coalesce(v_item.paid_quantity, 0), v_item.kitchen_status,
    v_item.sent_to_kitchen_at, v_item.notes, v_item.created_at,
    v_actor, nullif(btrim(coalesce(p_reason, '')), ''), nullif(btrim(coalesce(p_category, '')), '')
  );

  -- O gatilho update_comanda_subtotal recalcula o total da comanda no delete.
  delete from public.pdv_comanda_items where id = p_item_id;

  perform public.log_pdv_action(
    'cancel_item'::public.pdv_permission_action,
    'comanda', v_item.comanda_id,
    'comanda_item', p_item_id,
    jsonb_build_object(
      'product_name', v_item.product_name,
      'quantity', v_item.quantity,
      'unit_price', v_item.unit_price,
      'subtotal', v_item.subtotal,
      'paid_quantity', v_item.paid_quantity,
      'kitchen_status', v_item.kitchen_status,
      'category', p_category
    ),
    p_reason
  );

  return jsonb_build_object(
    'ok', true,
    'comanda_id', v_item.comanda_id,
    'product_name', v_item.product_name,
    'subtotal', v_item.subtotal
  );
end;
$$;

revoke all on function public.pdv_cancel_comanda_item(uuid, text, text) from public;
grant execute on function public.pdv_cancel_comanda_item(uuid, text, text) to authenticated;
