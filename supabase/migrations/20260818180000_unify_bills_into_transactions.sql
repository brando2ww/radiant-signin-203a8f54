-- Unifica Contas a Pagar/Receber com Lançamentos, e traz parcelas e recorrência.
--
-- O sistema tinha dois módulos financeiros paralelos, cada um pela metade:
--
--   `bills`                       tinha parcelas e recorrência, mas classificava
--                                 por um texto solto (`category`), sem vínculo
--                                 com o plano de contas — e a DRE não a lê.
--   `pdv_financial_transactions`  tem conta contábil, centro de custo,
--                                 fornecedor, competência e taxas, e é a que a
--                                 DRE lê — mas não sabia parcelar nem repetir.
--
-- Quem lançava em Contas a Pagar achava que tinha registrado a despesa, e ela
-- nunca aparecia no resultado.
--
-- Aqui a segunda tabela ganha o que faltava e recebe uma CÓPIA do conteúdo da
-- primeira. `bills` NÃO é apagada nem alterada: continua no banco, intacta,
-- como histórico e como rede de segurança. `source_bill_id` liga as duas e
-- torna esta migração repetível sem duplicar nada.

-- ---------------------------------------------------------------------------
-- 1. Parcelamento e recorrência
-- ---------------------------------------------------------------------------

alter table public.pdv_financial_transactions
  add column if not exists group_id uuid,
  add column if not exists installment_number int,
  add column if not exists installment_total int,
  add column if not exists recurrence text not null default 'none',
  add column if not exists recurrence_until date,
  add column if not exists source_bill_id uuid;

comment on column public.pdv_financial_transactions.group_id is
  'Une as parcelas de um mesmo lançamento, ou as ocorrências de um recorrente. Editar o grupo altera só as parcelas em aberto.';
comment on column public.pdv_financial_transactions.recurrence_until is
  'Fim da recorrência. Nulo = sem fim: o sistema mantém um horizonte rolante de 12 meses à frente.';

alter table public.pdv_financial_transactions
  drop constraint if exists pdv_financial_transactions_recurrence_check;
alter table public.pdv_financial_transactions
  add constraint pdv_financial_transactions_recurrence_check
  check (recurrence in ('none', 'weekly', 'monthly', 'quarterly', 'yearly'));

create index if not exists idx_pdv_ft_group
  on public.pdv_financial_transactions (group_id)
  where group_id is not null;

-- Idempotência da cópia: rodar de novo não duplica.
create unique index if not exists uq_pdv_ft_source_bill
  on public.pdv_financial_transactions (source_bill_id)
  where source_bill_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Cópia de bills, preservando o original
-- ---------------------------------------------------------------------------

insert into public.pdv_financial_transactions (
  user_id, transaction_type, description, amount,
  gross_amount, net_amount, fee_percentage_applied, fee_fixed_applied, fee_amount,
  due_date, competence_date, payment_date, status,
  chart_account_id, bank_account_id, payment_method,
  group_id, installment_number, installment_total,
  recurrence, notes, source_bill_id, created_at
)
select
  b.user_id,
  case when b.type = 'receivable' then 'receivable' else 'payable' end,
  b.title,
  b.amount,
  b.amount, b.amount, 0, 0, 0,
  b.due_date::date,
  -- Competência pelo vencimento: é o que a conta representava.
  b.due_date::date,
  b.paid_at::date,
  case
    when lower(coalesce(b.status, '')) in ('paid', 'pago')         then 'paid'
    when lower(coalesce(b.status, '')) in ('cancelled', 'canceled', 'cancelado') then 'cancelled'
    else 'pending'
  end,
  -- Casa a categoria com o plano de contas do próprio tenant, pelo nome. O que
  -- não casar fica sem conta e aparece como "Sem classificação" na DRE — nunca
  -- chutando um grupo errado, que seria pior do que não classificar.
  (
    select c.id
      from public.pdv_chart_of_accounts c
     where c.user_id = b.user_id
       and b.category is not null
       and (c.name ilike b.category || '%' or b.category ilike c.name || '%')
     order by c.parent_id nulls first, length(c.name)
     limit 1
  ),
  b.bank_account_id,
  b.payment_method,
  -- Parcelas viram grupo: a primeira é a âncora, as demais apontam para ela.
  case when coalesce(b.installments, 1) > 1 then coalesce(b.parent_bill_id, b.id) end,
  case when coalesce(b.installments, 1) > 1 then b.current_installment end,
  case when coalesce(b.installments, 1) > 1 then b.installments end,
  case when coalesce(b.is_recurring, false) then 'monthly' else 'none' end,
  -- A categoria original fica registrada mesmo quando casou: é o rastro de
  -- onde o lançamento veio, e o que permite reclassificar em lote depois.
  nullif(
    concat_ws(E'\n',
      b.notes,
      case when b.category is not null then 'Categoria de origem: ' || b.category end,
      'Importado de Contas a Pagar/Receber'
    ), ''),
  b.id,
  b.created_at
from public.bills b
where not exists (
  select 1 from public.pdv_financial_transactions t where t.source_bill_id = b.id
);

-- ---------------------------------------------------------------------------
-- 3. Horizonte rolante dos recorrentes
-- ---------------------------------------------------------------------------

-- Recorrente sem data de fim não pode gerar linhas para sempre. A função
-- completa até 12 meses à frente e é chamada quando o módulo financeiro abre —
-- assim não depende de cron, e quem nunca abre o módulo não acumula lixo.
create or replace function public.pdv_extend_recurring_transactions(_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_grupo record;
  v_prox date;
  v_horizonte date := (current_date + interval '12 months')::date;
  v_criados int := 0;
  v_passo interval;
  -- Teto por grupo: um recorrente semanal parado há anos geraria centenas de
  -- linhas de uma vez. Preenche o que couber e volta a completar na próxima.
  v_teto int;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;

  for v_grupo in
    select distinct on (coalesce(t.group_id, t.id))
           t.id, t.group_id, t.user_id, t.transaction_type, t.description, t.amount,
           t.chart_account_id, t.cost_center_id, t.bank_account_id, t.supplier_id,
           t.customer_id, t.payment_method, t.notes, t.recurrence, t.recurrence_until,
           t.due_date
      from public.pdv_financial_transactions t
     where t.user_id = _user_id
       and t.recurrence <> 'none'
       and t.status <> 'cancelled'
       and (t.recurrence_until is null or t.recurrence_until > current_date)
     order by coalesce(t.group_id, t.id), t.due_date desc
  loop
    v_passo := case v_grupo.recurrence
                 when 'weekly'    then interval '1 week'
                 when 'monthly'   then interval '1 month'
                 when 'quarterly' then interval '3 months'
                 when 'yearly'    then interval '1 year'
               end;

    v_prox := (v_grupo.due_date + v_passo)::date;
    v_teto := 0;

    while v_teto < 60 and v_prox <= least(v_horizonte, coalesce(v_grupo.recurrence_until, v_horizonte)) loop
      insert into public.pdv_financial_transactions (
        user_id, transaction_type, description, amount,
        gross_amount, net_amount, fee_percentage_applied, fee_fixed_applied, fee_amount,
        due_date, competence_date, status,
        chart_account_id, cost_center_id, bank_account_id, supplier_id, customer_id,
        payment_method, notes, group_id, recurrence, recurrence_until
      ) values (
        v_grupo.user_id, v_grupo.transaction_type, v_grupo.description, v_grupo.amount,
        v_grupo.amount, v_grupo.amount, 0, 0, 0,
        v_prox, v_prox, 'pending',
        v_grupo.chart_account_id, v_grupo.cost_center_id, v_grupo.bank_account_id,
        v_grupo.supplier_id, v_grupo.customer_id,
        v_grupo.payment_method, v_grupo.notes,
        coalesce(v_grupo.group_id, v_grupo.id), v_grupo.recurrence, v_grupo.recurrence_until
      );
      v_criados := v_criados + 1;
      v_teto := v_teto + 1;
      v_prox := (v_prox + v_passo)::date;
    end loop;
  end loop;

  return v_criados;
end;
$$;

grant execute on function public.pdv_extend_recurring_transactions(uuid) to authenticated;
