-- Recebimento de pedido de compra: dá entrada no estoque, registra a
-- movimentação e recalcula o custo médio ponderado do insumo.
--
-- p_items: [{ "item_id": uuid, "quantity": numeric }, ...]
--
-- É idempotente por diferença: movimenta apenas o delta entre a quantidade
-- recebida informada agora e a que já estava registrada no item. Reenviar o
-- mesmo recebimento não duplica estoque.

-- pdv_stock_movements.order_item_id referencia pdv_order_items (itens de VENDA).
-- Compras precisam da própria referência, senão a FK estoura no recebimento.
alter table public.pdv_stock_movements
  add column if not exists purchase_order_item_id uuid
    references public.pdv_purchase_order_items(id) on delete set null;

create index if not exists pdv_stock_movements_purchase_order_item_id_idx
  on public.pdv_stock_movements (purchase_order_item_id);

create or replace function public.pdv_receive_purchase_order(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_order   public.pdv_purchase_orders%rowtype;
  v_item    public.pdv_purchase_order_items%rowtype;
  v_ing     public.pdv_ingredients%rowtype;
  v_entry   jsonb;
  v_qty     numeric;
  v_delta   numeric;
  v_new_stock numeric;
  v_new_avg   numeric;
  v_moved   int := 0;
  v_pending int;
  v_status  text;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  select * into v_order
  from public.pdv_purchase_orders
  where id = p_order_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Pedido não encontrado';
  end if;

  if v_order.status = 'cancelled' then
    raise exception 'Pedido cancelado não pode ser recebido';
  end if;

  for v_entry in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := coalesce((v_entry->>'quantity')::numeric, 0);
    if v_qty < 0 then
      raise exception 'Quantidade recebida não pode ser negativa';
    end if;

    select * into v_item
    from public.pdv_purchase_order_items
    where id = (v_entry->>'item_id')::uuid
      and purchase_order_id = p_order_id
    for update;

    if not found then
      raise exception 'Item % não pertence a este pedido', v_entry->>'item_id';
    end if;

    v_delta := v_qty - coalesce(v_item.quantity_received, 0);

    update public.pdv_purchase_order_items
    set quantity_received = v_qty
    where id = v_item.id;

    if v_delta = 0 then
      continue;
    end if;

    select * into v_ing
    from public.pdv_ingredients
    where id = v_item.ingredient_id and user_id = v_user_id
    for update;

    if not found then
      raise exception 'Insumo do item não encontrado';
    end if;

    v_new_stock := coalesce(v_ing.current_stock, 0) + v_delta;
    if v_new_stock < 0 then
      v_new_stock := 0;
    end if;

    -- Custo médio ponderado: só recalcula em entradas (delta > 0) e quando há
    -- saldo. Em estorno (delta < 0) o custo médio é preservado.
    if v_delta > 0 and v_new_stock > 0 then
      v_new_avg := (
        coalesce(v_ing.current_stock, 0) * coalesce(v_ing.average_cost, v_ing.unit_cost, 0)
        + v_delta * coalesce(v_item.unit_price, 0)
      ) / v_new_stock;
    else
      v_new_avg := coalesce(v_ing.average_cost, v_ing.unit_cost, 0);
    end if;

    update public.pdv_ingredients
    set current_stock  = v_new_stock,
        average_cost   = v_new_avg,
        current_balance = v_new_stock * v_new_avg,
        unit_cost      = case
                           when v_delta > 0 then coalesce(v_item.unit_price, v_ing.unit_cost)
                           else v_ing.unit_cost
                         end,
        updated_at     = now()
    where id = v_ing.id;

    insert into public.pdv_stock_movements
      (ingredient_id, type, quantity, unit_cost, purchase_order_item_id, reason, created_by)
    values (
      v_ing.id,
      case when v_delta > 0 then 'entrada' else 'ajuste' end::public.pdv_stock_movement_type,
      abs(v_delta),
      v_item.unit_price,
      v_item.id,
      case
        when v_delta > 0 then 'Recebimento do pedido ' || v_order.order_number
        else 'Estorno de recebimento do pedido ' || v_order.order_number
      end,
      v_user_id
    );

    v_moved := v_moved + 1;
  end loop;

  -- Status do pedido: recebido só quando nenhum item ficou faltando.
  select count(*) into v_pending
  from public.pdv_purchase_order_items
  where purchase_order_id = p_order_id
    and coalesce(quantity_received, 0) < quantity;

  if v_pending = 0 then
    v_status := 'received';
  elsif exists (
    select 1 from public.pdv_purchase_order_items
    where purchase_order_id = p_order_id and coalesce(quantity_received, 0) > 0
  ) then
    v_status := 'partial';
  else
    v_status := v_order.status;
  end if;

  update public.pdv_purchase_orders
  set status = v_status,
      actual_delivery = case
                          when v_status = 'received' then current_date
                          else actual_delivery
                        end,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'status', v_status,
    'items_moved', v_moved,
    'items_pending', v_pending
  );
end;
$$;

grant execute on function public.pdv_receive_purchase_order(uuid, jsonb) to authenticated;
