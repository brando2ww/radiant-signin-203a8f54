-- Velara · Força de vendas · teste da fundação (transação desfeita no fim: não deixa rastro).
--   ssh kvm8v 'docker exec -i velara-pdv-db psql -U postgres -d postgres -At -v ON_ERROR_STOP=1' < supabase/tests/vendas_fundacao.test.sql
-- Cada checagem imprime "ok - ..." ou derruba com "FALHOU: ...".
begin;

create function pg_temp.check(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FALHOU: %', p_msg; end if;
  raise notice 'ok - %', p_msg;
end $$;
create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true); end $$;

-- Estabelecimento Teste: O dono · R representante (Rita) · S outro representante (Saulo) · G gerente · C caixa
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-4000-f000-00000000000f', 'vt-dono@teste.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-f000-000000000001', 'vt-rep@teste.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-f000-000000000002', 'vt-rep2@teste.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-f000-000000000003', 'vt-gerente@teste.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-4000-f000-000000000004', 'vt-caixa@teste.local', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');
insert into public.tenants (id, name, owner_user_id) values ('00000000-0000-4000-f000-0000000000aa', 'Distribuidora Teste', '00000000-0000-4000-f000-00000000000f');
insert into public.establishment_users (establishment_owner_id, user_id, role, display_name, is_active) values
  ('00000000-0000-4000-f000-00000000000f', '00000000-0000-4000-f000-000000000001', 'representante', 'Rita Rep', true),
  ('00000000-0000-4000-f000-00000000000f', '00000000-0000-4000-f000-000000000002', 'representante', 'Saulo Rep', true),
  ('00000000-0000-4000-f000-00000000000f', '00000000-0000-4000-f000-000000000003', 'gerente', 'Gil Gerente', true),
  ('00000000-0000-4000-f000-00000000000f', '00000000-0000-4000-f000-000000000004', 'caixa', 'Caio Caixa', true);
insert into public.vendas_representantes (id, user_id, rep_user_id, name, commission_percent, max_discount_percent) values
  ('00000000-0000-4000-f000-0000000000b1', '00000000-0000-4000-f000-00000000000f', '00000000-0000-4000-f000-000000000001', 'Rita Rep', 5, 20),
  ('00000000-0000-4000-f000-0000000000b2', '00000000-0000-4000-f000-00000000000f', '00000000-0000-4000-f000-000000000002', 'Saulo Rep', 3, 0);
insert into public.pdv_customers (id, user_id, name, cnpj, company_name, representative_id, is_b2b) values
  ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-f000-00000000000f', 'Mercado da Rita', '11222333000181', 'Mercado da Rita Ltda', '00000000-0000-4000-f000-0000000000b1', true),
  ('00000000-0000-4000-f000-0000000000c2', '00000000-0000-4000-f000-00000000000f', 'Loja do Saulo', null, null, '00000000-0000-4000-f000-0000000000b2', true),
  ('00000000-0000-4000-f000-0000000000c3', '00000000-0000-4000-f000-00000000000f', 'Cliente do balcão', null, null, null, false);
insert into public.pdv_products (id, user_id, name, category, price_salon, price_balcao, b2b_enabled, price_b2b, image_url) values
  ('00000000-0000-4000-f000-0000000000d1', '00000000-0000-4000-f000-00000000000f', 'Caixa de café 1kg', 'Cafés', 60, 60, true, 50, 'https://exemplo/cafe.png');

-- ── Sem o módulo liberado ──────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
select pg_temp.check((select count(*) from public.vendas_representantes) = 0, 'sem o módulo, o representante não vê nada do módulo');
select pg_temp.check((select count(*) from public.pdv_customers where user_id = '00000000-0000-4000-f000-00000000000f') = 0,
  'sem o módulo, o representante não vê clientes');
select pg_temp.as_admin();
insert into public.tenant_modules (tenant_id, module, is_active) values ('00000000-0000-4000-f000-0000000000aa', 'vendas', true);

-- ── Quem vê o quê ──────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
select pg_temp.check((select string_agg(name, ',' order by name) from public.pdv_customers where user_id = '00000000-0000-4000-f000-00000000000f') = 'Mercado da Rita',
  'representante vê só os clientes da carteira dele');
select pg_temp.check((select count(*) from public.vendas_representantes) = 1, 'representante vê só o próprio cadastro');
select pg_temp.check((select count(*) from public.pdv_products where id = '00000000-0000-4000-f000-0000000000d1') = 1, 'representante vê o catálogo');
insert into public.pdv_customers (user_id, name) values ('00000000-0000-4000-f000-00000000000f', 'Cliente novo da Rita');
select pg_temp.check((select representative_id = '00000000-0000-4000-f000-0000000000b1' and is_b2b from public.pdv_customers where name = 'Cliente novo da Rita'),
  'cliente cadastrado pelo representante entra na carteira dele');
select pg_temp.as_user('00000000-0000-4000-f000-000000000003');
select pg_temp.check((select count(*) from public.pdv_customers where user_id = '00000000-0000-4000-f000-00000000000f') = 4, 'gerente vê todos os clientes');
select pg_temp.check((select count(*) from public.vendas_representantes) = 2, 'gerente vê todos os representantes');
select pg_temp.as_user('00000000-0000-4000-f000-000000000004');
select pg_temp.check((select count(*) from public.vendas_representantes) = 0, 'caixa não entra no módulo');
select pg_temp.check((select count(*) from public.pdv_customers where user_id = '00000000-0000-4000-f000-00000000000f') = 4,
  'caixa passa a ver os clientes do estabelecimento (antes via lista vazia)');

-- ── Proposta do representante ──────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
insert into public.vendas_propostas (id, customer_id, installments, first_due_days, interval_days, payment_method, valid_until, discount_amount, shipping_amount)
values ('00000000-0000-4000-f000-0000000000e1', '00000000-0000-4000-f000-0000000000c1', 3, 30, 30, 'boleto', current_date + 10, 0, 10);
insert into public.vendas_proposta_itens (proposta_id, position, product_id, description, quantity, unit_price, discount_percent)
values ('00000000-0000-4000-f000-0000000000e1', 1, '00000000-0000-4000-f000-0000000000d1', 'Caixa de café 1kg', 10, 50, 10);
select pg_temp.check((select number ~ '^ORC-\d{4}-0001$' and user_id = '00000000-0000-4000-f000-00000000000f' and representative_id = '00000000-0000-4000-f000-0000000000b1'
                        from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1'), 'proposta numerada, do dono certo e em nome do representante');
select pg_temp.check((select subtotal = 450 and total = 460 from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1'),
  'totais calculados no banco (10 x 50 com 10% = 450, mais 10 de frete)');
update public.vendas_propostas set discount_amount = 20 where id = '00000000-0000-4000-f000-0000000000e1';
select pg_temp.check((select total = 440 from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1'), 'desconto refaz o total');
select pg_temp.as_user('00000000-0000-4000-f000-000000000002');
select pg_temp.check((select count(*) from public.vendas_propostas) = 0, 'outro representante não vê a proposta');
do $$ begin
  begin
    insert into public.vendas_propostas (customer_id) values ('00000000-0000-4000-f000-0000000000c1');
    raise exception 'FALHOU: representante criou proposta para cliente de outro';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok - representante não cria proposta em nome de outro (%)', sqlstate;
  end;
end $$;

-- ── Página pública: rascunho não aparece; enviada aparece com a marca ──────
select pg_temp.as_anon();
select pg_temp.check(public.vendas_proposta_publica((select public_token from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1')) is null,
  'rascunho não abre pelo link');
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
update public.vendas_propostas set status = 'sent', sent_at = now() where id = '00000000-0000-4000-f000-0000000000e1';
select pg_temp.as_admin();
select set_config('t.token', (select public_token from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1'), true);
select pg_temp.as_anon();
select pg_temp.check((select (r -> 'proposta' ->> 'total')::numeric = 440 and jsonb_array_length(r -> 'itens') = 1 and r -> 'cliente' ->> 'name' = 'Mercado da Rita'
                        and r -> 'representante' ->> 'name' = 'Rita Rep' and r ? 'marca'
                        from (select public.vendas_proposta_publica(current_setting('t.token')) r) x), 'link público mostra proposta, itens, cliente, representante e marca');
select pg_temp.check((select count(*) from public.vendas_propostas) = 0, 'anônimo não lê a tabela direto');
select pg_temp.check((public.vendas_proposta_responder(current_setting('t.token'), true, 'João Comprador') ->> 'order_number') ~ '^PED-\d{4}-0001$',
  'cliente aprova pelo link e vira pedido');

-- ── Pedido e contas a receber ──────────────────────────────────────────────
select pg_temp.as_admin();
select pg_temp.check((select p.status = 'converted' and p.responder_name = 'João Comprador' and o.total = 440 and o.commission_percent = 5
                             and o.representative_id = '00000000-0000-4000-f000-0000000000b1'
                        from public.vendas_propostas p join public.vendas_pedidos o on o.id = p.order_id where p.id = '00000000-0000-4000-f000-0000000000e1'),
  'pedido com o total, o representante e a comissão dele');
select pg_temp.check((select count(*) = 3 and sum(amount) = 440 and min(due_date) = current_date + 30 and max(due_date) = current_date + 90
                             and bool_and(transaction_type = 'receivable' and customer_id = '00000000-0000-4000-f000-0000000000c1' and status = 'pending')
                        from public.pdv_financial_transactions where vendas_pedido_id = (select order_id from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1')),
  '3 parcelas no contas a receber, somando o total, com os vencimentos certos');
select pg_temp.check((select string_agg(amount::text, ',' order by installment_number) = '146.67,146.67,146.66'
                        from public.pdv_financial_transactions where vendas_pedido_id = (select order_id from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1')),
  'a última parcela leva o arredondamento');
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
select pg_temp.check((select count(*) from public.vendas_pedidos) = 1, 'representante vê o pedido dele');
do $$ begin
  begin
    update public.vendas_pedidos set total = 1 where true;
    if exists (select 1 from public.vendas_pedidos where total = 1) then raise exception 'FALHOU: representante alterou o pedido'; end if;
    raise notice 'ok - representante não altera o pedido';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok - representante não altera o pedido (%)', sqlstate;
  end;
end $$;
select pg_temp.check((select count(*) from public.pdv_financial_transactions) = 0, 'representante não vê o financeiro');
select pg_temp.as_user('00000000-0000-4000-f000-000000000003');
select pg_temp.check((select count(*) from public.pdv_financial_transactions where vendas_pedido_id is not null) = 3, 'gerente vê o contas a receber');

-- ── Comissão sobre o recebido ──────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-f000-00000000000f');
update public.pdv_financial_transactions set status = 'paid', payment_date = current_date
 where vendas_pedido_id is not null and installment_number = 1;
select pg_temp.check((select count(*) = 1 and sum(amount) = 7.33 and bool_and(status = 'pending' and representative_id = '00000000-0000-4000-f000-0000000000b1')
                        from public.vendas_comissoes), 'parcela recebida gera comissão de 5% sobre ela');
update public.pdv_financial_transactions set status = 'pending', payment_date = null where vendas_pedido_id is not null and installment_number = 1;
select pg_temp.check((select status = 'cancelled' from public.vendas_comissoes), 'estorno da baixa cancela a comissão ainda não paga');
update public.pdv_financial_transactions set status = 'paid', payment_date = current_date where vendas_pedido_id is not null and installment_number = 1;
select pg_temp.check((select status = 'pending' from public.vendas_comissoes), 'nova baixa reativa a comissão');
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
select pg_temp.check((select count(*) from public.vendas_comissoes) = 1, 'representante vê a comissão dele');

-- ── Cancelar pedido ────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-f000-00000000000f');
select public.vendas_cancelar_pedido((select order_id from public.vendas_propostas where id = '00000000-0000-4000-f000-0000000000e1'), 'Cliente desistiu');
select pg_temp.check((select string_agg(status, ',' order by installment_number) = 'paid,cancelled,cancelled'
                        from public.pdv_financial_transactions where vendas_pedido_id is not null), 'cancelar o pedido cancela só as parcelas em aberto');

-- ── Agenda ─────────────────────────────────────────────────────────────────
select pg_temp.as_user('00000000-0000-4000-f000-000000000001');
insert into public.vendas_agenda (title, starts_at, customer_id) values ('Visita ao Mercado', now() + interval '1 day', '00000000-0000-4000-f000-0000000000c1');
select pg_temp.check((select representative_id = '00000000-0000-4000-f000-0000000000b1' and user_id = '00000000-0000-4000-f000-00000000000f' from public.vendas_agenda),
  'compromisso do representante fica na agenda dele');
select pg_temp.as_user('00000000-0000-4000-f000-000000000002');
select pg_temp.check((select count(*) from public.vendas_agenda) = 0, 'outro representante não vê a agenda dele');

-- ── Asaas: chave nunca sai para a tela ─────────────────────────────────────
select pg_temp.as_admin();
select public.vendas_asaas_gravar('00000000-0000-4000-f000-00000000000f', '$aact_teste_1234567890abcdef', 'sandbox', '{"name": "Distribuidora Teste"}');
select pg_temp.check(public.vendas_asaas_chave('00000000-0000-4000-f000-00000000000f') = '$aact_teste_1234567890abcdef', 'chave guardada no cofre e lida pelo servidor');
select pg_temp.as_user('00000000-0000-4000-f000-00000000000f');
select pg_temp.check((select key_hint = 'cdef' and status = 'connected' from public.vendas_asaas), 'a tela vê só o final da chave');
do $$ begin
  begin
    perform public.vendas_asaas_chave('00000000-0000-4000-f000-00000000000f');
    raise exception 'FALHOU: usuário leu a chave do Asaas';
  exception when others then
    if sqlerrm like 'FALHOU%' then raise; end if;
    raise notice 'ok - usuário não lê a chave do Asaas (%)', sqlstate;
  end;
end $$;

rollback;
