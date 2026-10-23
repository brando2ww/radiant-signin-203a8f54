-- Item de comanda CANCELADA não é pedido: a mesa que só tem isso é liberada.
--
-- Caso de 23/10/2026 no Sertão Adentro (Mesa 01, PDV701916): a comanda
-- "Erica teste" (R$ 133, 3 itens) foi cancelada às 11:28 e sobrou a comanda
-- "Felipe", aberta e vazia. A mesa continuou ocupada (correto: tinha uma
-- comanda ativa), mas a liberação automática de 3 h nunca soltaria essa mesa,
-- porque contava como "pedido" os itens que ficaram dentro da comanda
-- cancelada (a comanda cancelada guarda os itens para o relatório de
-- cancelamentos). O dono teve de cancelar a mesa à mão.
--
-- Única mudança em relação a 20261023120000_liberar_mesas_vazias.sql: o
-- "tem item lançado" ignora comanda com status 'cancelada'. Comanda fechada
-- (paga) continua contando, e pagamento continua bloqueando como antes.

create or replace function public.pdv_liberar_mesas_vazias(p_horas int default 3)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text := format('Mesa aberta sem nenhum pedido; liberada automaticamente após %s h', p_horas);
  v_atendimentos int := 0;
  v_mesas_soltas int := 0;
  v_ids uuid[];
begin
  select coalesce(array_agg(o.id), '{}') into v_ids
    from pdv_orders o
   where o.table_id is not null
     and o.status in ('aberta', 'aberto')
     and o.opened_at < now() - make_interval(hours => greatest(p_horas, 1))
     -- Item de comanda cancelada não conta: a comanda saiu da conta da mesa.
     and not exists (
       select 1 from pdv_comandas c
         join pdv_comanda_items ci on ci.comanda_id = c.id
        where c.order_id = o.id
          and c.status <> 'cancelada')
     -- Item lançado pelo caminho antigo (direto no atendimento, sem comanda)
     -- também é pedido. Não olhar aqui fez a primeira rodada cancelar um
     -- atendimento com R$ 79,00 lançado (PDV146939).
     and not exists (select 1 from pdv_order_items oi where oi.order_id = o.id)
     and not exists (select 1 from pdv_payments p where p.order_id = o.id);

  if array_length(v_ids, 1) > 0 then
    update pdv_comandas
       set status = 'cancelada',
           close_reason = v_motivo,
           closed_by_waiter_at = coalesce(closed_by_waiter_at, now()),
           updated_at = now()
     where order_id = any (v_ids)
       and status in ('aberta', 'aguardando_pagamento', 'em_cobranca');

    update pdv_orders
       set status = 'cancelada',
           cancelled_at = now(),
           cancellation_reason = v_motivo,
           updated_at = now()
     where id = any (v_ids);
    get diagnostics v_atendimentos = row_count;

    update pdv_tables
       set current_order_id = null, status = 'livre', updated_at = now()
     where current_order_id = any (v_ids);
  end if;

  -- Mesa ocupada sem atendimento aberto por trás (o atendimento foi fechado
  -- ou cancelado e a mesa não foi solta). Só depois de 3 h parada, para não
  -- correr com uma abertura em andamento.
  update pdv_tables t
     set current_order_id = null, status = 'livre', updated_at = now()
   where t.status <> 'livre'
     and t.updated_at < now() - make_interval(hours => greatest(p_horas, 1))
     and (t.current_order_id is null
          or not exists (select 1 from pdv_orders o
                          where o.id = t.current_order_id and o.status in ('aberta', 'aberto')));
  get diagnostics v_mesas_soltas = row_count;

  return jsonb_build_object('atendimentos', v_atendimentos, 'mesas_sem_atendimento', v_mesas_soltas);
end;
$$;

revoke all on function public.pdv_liberar_mesas_vazias(int) from public, anon, authenticated;
