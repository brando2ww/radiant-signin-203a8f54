-- Lançamento automático da nota recebida no contas a pagar.
--
-- Complementa pdv_lancar_nota_no_financeiro: quando o estabelecimento liga a
-- chave abaixo, cada nota nova encontrada pela varredura da SEFAZ já nasce como
-- conta a pagar, sem ninguém digitar. Desligado por padrão, porque lançar no
-- financeiro em nome do cliente sem ele pedir não é decisão nossa.
alter table public.tenant_fiscal_config
  add column if not exists nfe_auto_financeiro boolean not null default false;

comment on column public.tenant_fiscal_config.nfe_auto_financeiro is
  'Lança automaticamente no contas a pagar toda nota de entrada encontrada na SEFAZ.';

-- A varredura roda com service_role e sem usuário logado, então a função
-- precisa aceitar essa origem. Continua barrando qualquer outro chamador.
create or replace function public.pdv_lancar_nota_no_financeiro(
  p_invoice_id uuid,
  p_due_date date default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_servico boolean := coalesce(auth.role(), '') = 'service_role';
  v_nota record;
  v_fornecedor uuid;
  v_conta uuid;
  v_centro uuid;
  v_transacao uuid;
  v_vencimento date;
begin
  select * into v_nota from public.pdv_invoices where id = p_invoice_id;
  if not found then
    raise exception 'Nota não encontrada';
  end if;

  if not (v_servico or v_nota.user_id = v_actor or public.is_establishment_member(v_nota.user_id)) then
    raise exception 'Sem acesso a esta nota';
  end if;

  if v_nota.financial_transaction_id is not null then
    return jsonb_build_object('ok', false, 'motivo', 'ja_lancada',
                              'transaction_id', v_nota.financial_transaction_id);
  end if;

  if coalesce(v_nota.total_invoice, 0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'sem_valor');
  end if;

  if v_nota.supplier_id is not null then
    v_fornecedor := v_nota.supplier_id;
  elsif coalesce(v_nota.supplier_cnpj, '') <> '' then
    select id into v_fornecedor
      from public.pdv_suppliers
     where user_id = v_nota.user_id
       and regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = regexp_replace(v_nota.supplier_cnpj, '\D', '', 'g')
     limit 1;

    if v_fornecedor is null then
      insert into public.pdv_suppliers (user_id, name, cnpj, is_active)
      values (v_nota.user_id, coalesce(v_nota.supplier_name, 'Fornecedor'), v_nota.supplier_cnpj, true)
      returning id into v_fornecedor;
    end if;
  end if;

  if v_fornecedor is not null then
    select default_chart_account_id, default_cost_center_id
      into v_conta, v_centro
      from public.pdv_suppliers where id = v_fornecedor;
  end if;

  v_vencimento := coalesce(p_due_date, v_nota.emission_date::date);

  insert into public.pdv_financial_transactions (
    user_id, transaction_type, amount, due_date, status, description,
    supplier_id, chart_account_id, cost_center_id, document_number,
    competence_date, invoice_id, notes
  ) values (
    v_nota.user_id, 'payable', v_nota.total_invoice, v_vencimento, 'pending',
    'NF-e ' || coalesce(v_nota.invoice_number, '') || ' · ' || coalesce(v_nota.supplier_name, 'Fornecedor'),
    v_fornecedor, v_conta, v_centro, v_nota.invoice_key,
    v_nota.emission_date::date, v_nota.id,
    case when p_due_date is null
      then 'Lançada a partir do resumo da SEFAZ. A nota não informou duplicata: confira o vencimento.'
      else 'Lançada a partir do resumo da SEFAZ.' end
  ) returning id into v_transacao;

  update public.pdv_invoices
     set financial_transaction_id = v_transacao,
         supplier_id = coalesce(supplier_id, v_fornecedor),
         updated_at = now()
   where id = p_invoice_id;

  return jsonb_build_object('ok', true, 'transaction_id', v_transacao,
                            'supplier_id', v_fornecedor, 'due_date', v_vencimento);
end;
$$;

revoke all on function public.pdv_lancar_nota_no_financeiro(uuid, date) from public;
grant execute on function public.pdv_lancar_nota_no_financeiro(uuid, date) to authenticated, service_role;
