-- Encerrar pedido de compra com mercadoria faltando, mediante justificativa.
--
-- Antes, um recebimento menor que o pedido só podia virar 'partial', e o pedido
-- ficava pendente para sempre quando o fornecedor simplesmente não ia entregar
-- o restante. Agora o painel pode encerrar assim mesmo, registrando o motivo.
--
-- O pedido vai para 'received' (sai da fila de pendências), mas closed_incomplete
-- e closure_reason preservam a verdade: fechou faltando mercadoria, e por quê.
-- As quantidades recebidas continuam sendo as reais, então estoque e custo médio
-- não são afetados por essa decisão.

alter table public.pdv_purchase_orders
  add column if not exists closed_incomplete boolean not null default false;

alter table public.pdv_purchase_orders
  add column if not exists closure_reason text;

comment on column public.pdv_purchase_orders.closed_incomplete is
  'Pedido encerrado com itens faltando, por decisão do gestor (fornecedor não entregaria o restante).';
comment on column public.pdv_purchase_orders.closure_reason is
  'Justificativa obrigatória quando closed_incomplete = true.';

-- Core: dois parâmetros novos no fim, ambos com default, para não quebrar as
-- chamadas existentes (a edge purchase-order-receipt chama com 5 argumentos).
-- Recriado a partir da definição que está em produção hoje.
drop function if exists public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text);

CREATE OR REPLACE FUNCTION public.pdv_receive_purchase_order_core(p_user_id uuid, p_order_id uuid, p_items jsonb, p_actor text DEFAULT NULL::text, p_channel text DEFAULT 'admin'::text, p_close_incomplete boolean DEFAULT false, p_close_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
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
  v_suffix  text := coalesce(' (' || nullif(trim(p_actor), '') || ')', '');
begin
  if p_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_channel not in ('admin', 'public') then
    raise exception 'Canal de recebimento inválido: %', p_channel;
  end if;

  -- Encerrar um pedido com mercadoria faltando é decisão de gestão: exige
  -- motivo registrado e só vale pelo painel. O canal público (QR) é
  -- preenchido por quem recebe a carga, que não decide isso.
  if p_close_incomplete then
    if p_channel <> 'admin' then
      raise exception 'Encerramento com pendência só pelo painel';
    end if;
    if coalesce(trim(p_close_reason), '') = '' then
      raise exception 'Informe o motivo para encerrar o pedido com itens faltando';
    end if;
  end if;

  select * into v_order
  from public.pdv_purchase_orders
  where id = p_order_id and user_id = p_user_id
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

    -- Guardas do canal público: mexer no estoque para baixo, ou dar entrada
    -- acima do pedido, só pelo admin com login.
    if p_channel = 'public' then
      if v_delta < 0 then
        raise exception 'Estorno não é permitido no recebimento por QR';
      end if;
      if v_qty > v_item.quantity then
        raise exception 'Recebimento acima do pedido não é permitido no QR';
      end if;
    end if;

    update public.pdv_purchase_order_items
    set quantity_received = v_qty
    where id = v_item.id;

    if v_delta = 0 then
      continue;
    end if;

    select * into v_ing
    from public.pdv_ingredients
    where id = v_item.ingredient_id and user_id = p_user_id
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

    -- pdv_stock_movements não tem user_id (a posse vem pelo ingrediente).
    -- created_by fica com o dono: no canal público não existe usuário logado,
    -- então quem conferiu vai identificado no reason.
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
      end || v_suffix,
      p_user_id
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
  elsif p_close_incomplete then
    -- Fornecedor não vai entregar o restante: fecha o pedido para ele sair da
    -- fila, preservando em closure_reason o motivo e a diferença nas quantidades.
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
      closed_incomplete = case
                            when p_close_incomplete and v_pending > 0 then true
                            else closed_incomplete
                          end,
      closure_reason = case
                         when p_close_incomplete and v_pending > 0
                           then nullif(trim(p_close_reason), '')
                         else closure_reason
                       end,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'status', v_status,
    'items_moved', v_moved,
    'items_pending', v_pending,
    'closed_incomplete', (p_close_incomplete and v_pending > 0)
  );
end;
$function$
;


revoke all on function public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text, boolean, text) from public;
revoke all on function public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text, boolean, text) from anon;
revoke all on function public.pdv_receive_purchase_order_core(uuid, uuid, jsonb, text, text, boolean, text) from authenticated;

-- Wrapper do painel: recriado com a assinatura nova. Continua security definer
-- (ver 20260803140000), que é o que permite alcançar o core.
drop function if exists public.pdv_receive_purchase_order(uuid, jsonb);

create function public.pdv_receive_purchase_order(
  p_order_id uuid,
  p_items jsonb,
  p_close_incomplete boolean default false,
  p_close_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;
  return public.pdv_receive_purchase_order_core(
    v_user_id, p_order_id, p_items, null, 'admin', p_close_incomplete, p_close_reason
  );
end;
$$;

grant execute on function public.pdv_receive_purchase_order(uuid, jsonb, boolean, text) to authenticated;
