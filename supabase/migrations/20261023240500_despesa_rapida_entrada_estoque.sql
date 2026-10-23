-- Despesa rápida com entrada no estoque, numa transação só.
--
-- Antes, a tela gravava a despesa e depois, item a item pelo navegador, o
-- movimento e o saldo do insumo ("best-effort"): se o estoque falhasse no meio,
-- a despesa ficava lançada sem a mercadoria (e reenviar duplicava a despesa).
-- Também não recalculava o custo médio nem deixava rastro em Compras.
--
-- Agora grava tudo ou nada, nos mesmos lugares da compra avulsa e da entrada
-- por NF-e, para o histórico ficar num lugar só:
--   pdv_financial_transactions  despesa paga (igual à despesa rápida sem estoque)
--   pdv_invoices / _items       documento 'manual' (aparece em Compras como Avulsa)
--   pdv_stock_movements         uma 'entrada' por linha, com o custo
--   pdv_ingredients             saldo, custo médio ponderado e saldo em R$
--   pdv_ingredient_suppliers    último preço do fornecedor, quando informado
--
-- A sangria no caixa (pagamento em dinheiro) continua com a tela, como antes.
--
-- p_items: [{ "ingredient_id": uuid, "quantity": numeric, "unit_cost": numeric }, ...]
--
-- security invoker: valem as mesmas regras de acesso de quem já gravava pela
-- tela (despesa no usuário logado; insumo do dono ou de quem é da equipe).

create or replace function public.pdv_quick_expense_with_stock(
  p_description      text,
  p_amount           numeric,
  p_payment_date     date,
  p_chart_account_id uuid,
  p_items            jsonb,
  p_cost_center_id   uuid    default null,
  p_payment_method   text    default null,
  p_supplier_id      uuid    default null,
  p_document_number  text    default null,
  p_notes            text    default null,
  p_update_cost      boolean default true
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id    uuid := auth.uid();
  v_date       date := coalesce(p_payment_date, current_date);
  v_desc       text := nullif(trim(p_description), '');
  v_doc        text := nullif(trim(p_document_number), '');
  v_notes      text := nullif(trim(p_notes), '');
  v_tx_id      uuid;
  v_invoice_id uuid;
  v_supplier   public.pdv_suppliers%rowtype;
  v_ing        public.pdv_ingredients%rowtype;
  v_entry      jsonb;
  v_qty        numeric;
  v_cost       numeric;
  v_base       numeric;
  v_old_avg    numeric;
  v_new_stock  numeric;
  v_new_avg    numeric;
  v_items_sum  numeric := 0;
  v_n          int := 0;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;
  if v_desc is null then
    raise exception 'Informe a descrição da despesa';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    raise exception 'O valor da despesa precisa ser maior que zero';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Escolha ao menos um insumo para dar entrada no estoque';
  end if;

  -- Confere as linhas antes de gravar qualquer coisa.
  for v_entry in select * from jsonb_array_elements(p_items)
  loop
    v_qty  := coalesce((v_entry->>'quantity')::numeric, 0);
    v_cost := coalesce((v_entry->>'unit_cost')::numeric, 0);
    if nullif(v_entry->>'ingredient_id', '') is null then
      raise exception 'Escolha o insumo de todas as linhas';
    end if;
    if v_qty <= 0 then
      raise exception 'A quantidade de cada insumo precisa ser maior que zero';
    end if;
    if v_cost < 0 then
      raise exception 'O custo unitário não pode ser negativo';
    end if;
    v_items_sum := v_items_sum + v_qty * v_cost;
  end loop;

  if p_supplier_id is not null then
    select * into v_supplier from public.pdv_suppliers where id = p_supplier_id;
  end if;

  -- 1) Financeiro: mesmos campos da despesa rápida sem estoque.
  insert into public.pdv_financial_transactions (
    user_id, transaction_type, status, description, amount, gross_amount, net_amount,
    fee_percentage_applied, fee_fixed_applied, fee_amount,
    due_date, payment_date, competence_date,
    chart_account_id, cost_center_id, payment_method, supplier_id, document_number, notes
  ) values (
    v_user_id, 'payable', 'paid', v_desc, p_amount, p_amount, p_amount,
    0, 0, 0,
    v_date, v_date, v_date,
    p_chart_account_id, p_cost_center_id, nullif(p_payment_method, ''), p_supplier_id, v_doc, v_notes
  )
  returning id into v_tx_id;

  -- 2) Documento, como a compra avulsa: aparece em Compras com o selo "Avulsa".
  --    invoice_key é única no banco inteiro, daí a chave sintética.
  --    A diferença entre o pago e a soma dos itens (frete, sacola, desconto)
  --    fica registrada no documento, não some.
  insert into public.pdv_invoices (
    user_id, invoice_number, invoice_key, series, emission_date, entry_date,
    supplier_id, supplier_cnpj, supplier_name,
    total_products, total_tax, total_invoice,
    freight_value, insurance_value, other_expenses, discount_value,
    operation_type, invoice_type, status, source, financial_transaction_id, notes
  ) values (
    v_user_id,
    coalesce(v_doc, 'AVULSA-' || to_char(v_date, 'YYYY-MM-DD')),
    'MANUAL-' || gen_random_uuid(),
    '',
    -- Meio-dia no horário de Brasília: à meia-noite UTC a data voltaria um dia.
    (v_date + time '12:00') at time zone 'America/Sao_Paulo',
    (v_date + time '12:00') at time zone 'America/Sao_Paulo',
    p_supplier_id,
    coalesce(v_supplier.cnpj, ''),
    coalesce(nullif(trim(v_supplier.name), ''), nullif(trim(v_supplier.company_name), ''), v_desc),
    round(v_items_sum, 2), 0, p_amount,
    0, 0, greatest(round(p_amount - v_items_sum, 2), 0), greatest(round(v_items_sum - p_amount, 2), 0),
    'entrada', 'compra', 'imported', 'manual', v_tx_id,
    coalesce(v_notes, 'Despesa rápida: ' || v_desc)
  )
  returning id into v_invoice_id;

  update public.pdv_financial_transactions
  set invoice_id = v_invoice_id
  where id = v_tx_id;

  -- 3) Estoque, linha a linha. O mesmo insumo em duas linhas funciona: a
  --    segunda lê o saldo que a primeira acabou de gravar.
  for v_entry in select * from jsonb_array_elements(p_items)
  loop
    v_qty  := (v_entry->>'quantity')::numeric;
    v_cost := coalesce((v_entry->>'unit_cost')::numeric, 0);
    v_n    := v_n + 1;

    -- A regra de acesso do insumo filtra: só passa insumo do dono ou da equipe.
    select * into v_ing
    from public.pdv_ingredients
    where id = (v_entry->>'ingredient_id')::uuid
    for update;

    if not found then
      raise exception 'Insumo não encontrado';
    end if;

    -- Custo médio ponderado, como no recebimento de pedido. Saldo negativo
    -- (consumo lançado sem entrada) não pesa: não existe mercadoria a esse custo.
    v_base      := greatest(coalesce(v_ing.current_stock, 0), 0);
    v_old_avg   := coalesce(nullif(v_ing.average_cost, 0), nullif(v_ing.unit_cost, 0), v_cost);
    v_new_stock := coalesce(v_ing.current_stock, 0) + v_qty;
    v_new_avg   := (v_base * v_old_avg + v_qty * v_cost) / (v_base + v_qty);

    update public.pdv_ingredients
    set current_stock   = v_new_stock,
        average_cost    = v_new_avg,
        current_balance = greatest(v_new_stock, 0) * v_new_avg,
        unit_cost       = case when p_update_cost and v_cost > 0 then v_cost else unit_cost end,
        real_cost       = case when p_update_cost and v_cost > 0 then v_cost else real_cost end,
        last_entry_date = greatest(coalesce(last_entry_date, v_date), v_date),
        updated_at      = now()
    where id = v_ing.id;

    insert into public.pdv_stock_movements
      (ingredient_id, type, quantity, unit_cost, reason, created_by)
    values
      (v_ing.id, 'entrada', v_qty, v_cost, 'Despesa rápida · ' || v_desc, v_user_id);

    insert into public.pdv_invoice_items (
      invoice_id, item_number, product_name, unit, quantity, unit_value, total_value,
      ingredient_id, match_status
    ) values (
      v_invoice_id, v_n, v_ing.name, coalesce(nullif(v_ing.unit, ''), 'un'),
      v_qty, v_cost, round(v_qty * v_cost, 2), v_ing.id, 'matched'
    );

    -- Memória do fornecedor: a próxima compra já sugere o último preço.
    if p_supplier_id is not null and v_cost > 0 then
      insert into public.pdv_ingredient_suppliers
        (user_id, ingredient_id, supplier_id, is_preferred, last_price, last_purchase_date)
      values
        (v_ing.user_id, v_ing.id, p_supplier_id, false, v_cost, v_date)
      on conflict (ingredient_id, supplier_id) do update
        set last_price         = excluded.last_price,
            last_purchase_date = excluded.last_purchase_date,
            updated_at         = now();
    end if;
  end loop;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'invoice_id', v_invoice_id,
    'items_moved', v_n
  );
end;
$$;

revoke execute on function public.pdv_quick_expense_with_stock(
  text, numeric, date, uuid, jsonb, uuid, text, uuid, text, text, boolean
) from public, anon;
grant execute on function public.pdv_quick_expense_with_stock(
  text, numeric, date, uuid, jsonb, uuid, text, uuid, text, text, boolean
) to authenticated;
