-- Mesa aberta sem nenhum pedido ficava ocupada para sempre.
--
-- Caso de 22/10/2026 no Kōten Garibaldi: a "Mesa retiradas" foi aberta três
-- vezes em três minutos; os itens foram lançados pelo antigo "Ver Pedido"
-- (pdv_order_items), que a lista da mesa não mostra, e a última abertura
-- ficou pendurada, aparecendo aberta e vazia no dia seguinte.
--
-- A cada 15 minutos, libera o atendimento de mesa aberto há mais de 3 horas
-- que não tem NENHUM item (nem em comanda, nem lançado direto no atendimento
-- pelo caminho antigo) nem pagamento.
-- Faz o mesmo que o "cancelar mesa" do PDV (pdv_cancel_order): comandas
-- vazias canceladas, atendimento cancelado com o motivo, mesa livre.
-- Também solta mesa marcada como ocupada que não aponta para atendimento aberto.

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
     and not exists (
       select 1 from pdv_comandas c
         join pdv_comanda_items ci on ci.comanda_id = c.id
        where c.order_id = o.id)
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

select cron.unschedule(jobid) from cron.job where jobname = 'velara-liberar-mesas-vazias';
select cron.schedule('velara-liberar-mesas-vazias', '*/15 * * * *',
  'select public.pdv_liberar_mesas_vazias(3)');
