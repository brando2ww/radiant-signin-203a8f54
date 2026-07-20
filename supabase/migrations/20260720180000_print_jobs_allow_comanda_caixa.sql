-- A comanda do caixa nunca foi impressa — em nenhum cliente, em centenas de
-- pedidos — por dois defeitos empilhados. Este arquivo corrige o segundo.
--
-- O primeiro estava no frontend: a consulta pedia `discount_amount` e
-- `change_amount` em delivery_orders, colunas que não existem (são `discount` e
-- `change_for`). O PostgREST devolvia 400 e o código, que só lia `data` e
-- ignorava `error`, desistia calado.
--
-- Atrás dele estava este: o CHECK de source_kind não inclui 'comanda_caixa',
-- então o banco rejeitava a inserção de qualquer forma. Mesmo com o frontend
-- correto, nenhum job jamais entraria.
--
-- A bridge já sabe imprimir esse cupom: ela escolhe o layout por payload.kind
-- (buildCaixaReceipt), que sempre veio preenchido.

alter table public.pdv_print_jobs
  drop constraint if exists pdv_print_jobs_source_kind_check;

alter table public.pdv_print_jobs
  add constraint pdv_print_jobs_source_kind_check
  check (source_kind = any (array['comanda', 'order', 'delivery', 'comanda_caixa']));

comment on constraint pdv_print_jobs_source_kind_check on public.pdv_print_jobs is
  'Tipos de cupom aceitos. comanda_caixa = via completa do caixa em pedidos de delivery, para centros com print_complete = true.';
