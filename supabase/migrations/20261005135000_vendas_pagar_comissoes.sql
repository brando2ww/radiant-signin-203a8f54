-- Velara · Força de vendas · pagar comissões aos representantes (05/10/2026).
--
-- A comissão nasce pendente quando a parcela do pedido é recebida (gatilho da fundação). Quando a empresa paga o
-- representante, a tela de Comissões chama esta função com as comissões escolhidas e a data do pagamento:
--   · cria UM lançamento a pagar, já pago, por representante ("Comissão de <nome> · <período>"), na conta
--     "Comissões" do plano de contas quando ela existe, para o pagamento entrar no caixa e na DRE;
--   · marca as comissões como pagas e guarda o lançamento (payable_id).
-- Só a gestão do estabelecimento (dono, gerente, financeiro, com o módulo liberado) pode chamar. Só acréscimo.

create or replace function public.vendas_pagar_comissoes(p_ids uuid[], p_data date)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_donos   uuid[];
  v_dono    uuid;
  v_conta   uuid;
  v_rep     record;
  v_lanc    uuid;
  v_periodo text;
  v_pago_em timestamptz;
  v_saida   jsonb := '[]'::jsonb;
  v_qtd     integer := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'Selecione ao menos uma comissão.' using errcode = 'P0001';
  end if;
  if p_data is null then
    raise exception 'Informe a data do pagamento.' using errcode = 'P0001';
  end if;

  select array_agg(distinct c.user_id) into v_donos from public.vendas_comissoes c where c.id = any (p_ids);
  if v_donos is null or cardinality(v_donos) <> 1 or not public.vendas_gestor(v_donos[1]) then
    raise exception 'Comissões não encontradas.' using errcode = 'P0001';
  end if;
  v_dono := v_donos[1];
  if (select count(*) from public.vendas_comissoes c where c.id = any (p_ids)) <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'Comissões não encontradas.' using errcode = 'P0001';
  end if;

  -- Trava as linhas: dois cliques (ou duas pessoas) não pagam a mesma comissão duas vezes.
  perform 1 from public.vendas_comissoes c where c.id = any (p_ids) for update;
  if exists (select 1 from public.vendas_comissoes c where c.id = any (p_ids) and c.status <> 'pending') then
    raise exception 'Alguma das comissões escolhidas já foi paga ou cancelada. Atualize a tela e tente de novo.' using errcode = 'P0001';
  end if;

  -- Conta "Comissões" do plano de contas do dono, se existir (a de nome exato primeiro).
  select a.id into v_conta
    from public.pdv_chart_of_accounts a
   where a.user_id = v_dono and coalesce(a.is_active, true) and a.account_type in ('expense', 'cost')
     and a.name ilike 'comiss%'
   order by (lower(btrim(a.name)) in ('comissões', 'comissoes')) desc, a.code
   limit 1;

  -- Hora do pagamento: agora, se foi hoje; senão o meio-dia da data informada (horário de Brasília).
  v_pago_em := case when p_data = (now() at time zone 'America/Sao_Paulo')::date then now()
                    else (p_data + time '12:00') at time zone 'America/Sao_Paulo' end;

  for v_rep in
    select c.representative_id, r.name, sum(c.amount) as total, min(c.received_at) as de, max(c.received_at) as ate,
           array_agg(c.id) as ids, count(*) as qtd
      from public.vendas_comissoes c
      join public.vendas_representantes r on r.id = c.representative_id
     where c.id = any (p_ids)
     group by c.representative_id, r.name
     order by r.name
  loop
    v_periodo := case
      when v_rep.de is null then to_char(p_data, 'MM/YYYY')
      when date_trunc('month', v_rep.de) = date_trunc('month', v_rep.ate) then to_char(v_rep.de, 'MM/YYYY')
      else to_char(v_rep.de, 'DD/MM/YYYY') || ' a ' || to_char(v_rep.ate, 'DD/MM/YYYY')
    end;

    v_lanc := null;
    if v_rep.total > 0 then
      insert into public.pdv_financial_transactions (user_id, transaction_type, amount, gross_amount, net_amount, due_date,
                                                     payment_date, competence_date, status, description, chart_account_id, notes)
      values (v_dono, 'payable', v_rep.total, v_rep.total, v_rep.total, p_data, p_data, p_data, 'paid',
              'Comissão de ' || v_rep.name || ' · ' || v_periodo, v_conta,
              v_rep.qtd || case when v_rep.qtd = 1 then ' comissão' else ' comissões' end || ' da Força de vendas')
      returning id into v_lanc;
    end if;

    update public.vendas_comissoes c set status = 'paid', paid_at = v_pago_em, payable_id = v_lanc
     where c.id = any (v_rep.ids);

    v_qtd := v_qtd + v_rep.qtd;
    v_saida := v_saida || jsonb_build_object('representative_id', v_rep.representative_id, 'name', v_rep.name,
                                             'amount', v_rep.total, 'count', v_rep.qtd, 'payable_id', v_lanc);
  end loop;

  return jsonb_build_object('paid', v_qtd, 'payables', v_saida);
end $$;

revoke all on function public.vendas_pagar_comissoes(uuid[], date) from public, anon;
grant execute on function public.vendas_pagar_comissoes(uuid[], date) to authenticated, service_role;

notify pgrst, 'reload schema';
