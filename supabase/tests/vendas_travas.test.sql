-- Força de vendas · travas de desconto e de "visto" (usa o estabelecimento de TESTE; transação desfeita no fim).
--   ssh kvm8v 'docker exec -i velara-pdv-db psql -U postgres -d postgres -At -v ON_ERROR_STOP=1' < supabase/tests/vendas_travas.test.sql
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
-- Espera erro com a dica dada; qualquer outro resultado derruba o teste.
create function pg_temp.erro(p_sql text, p_hint text, p_msg text) returns void language plpgsql as $$
declare v_hint text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_hint = pg_exception_hint;
    if coalesce(v_hint, '') = p_hint then raise notice 'ok - % (%)', p_msg, sqlerrm; return; end if;
    raise exception 'FALHOU: % · erro inesperado: %', p_msg, sqlerrm;
  end;
  raise exception 'FALHOU: % · passou sem erro', p_msg;
end $$;

select pg_temp.as_admin();
select set_config('t.dono', '8884ffd9-22a5-4e6d-9e02-82d81ee660b3', true);
select set_config('t.rita', '711d38ba-d495-49d7-9a84-696c0be1b60c', true);
select set_config('t.cliente', (select id::text from public.pdv_customers where user_id = current_setting('t.dono')::uuid and name = 'Mercado Bom Preço'), true);
select set_config('t.cafe', (select id::text from public.pdv_products where user_id = current_setting('t.dono')::uuid and name = 'Café torrado 1kg'), true);
select pg_temp.check((select max_discount_percent = 10 from public.vendas_representantes where rep_user_id = current_setting('t.rita')::uuid), 'a Rita tem limite de 10%');

-- ── Representante ──────────────────────────────────────────────────────────
select pg_temp.as_user(current_setting('t.rita')::uuid);
insert into public.vendas_propostas (id, customer_id) values ('7e57a000-0000-4000-a000-00000000f001', current_setting('t.cliente')::uuid);
insert into public.vendas_proposta_itens (proposta_id, product_id, description, quantity, unit_price, discount_percent)
values ('7e57a000-0000-4000-a000-00000000f001', current_setting('t.cafe')::uuid, 'Café torrado 1kg', 10, 48.5, 5);
select pg_temp.check(true, 'item do catálogo pelo preço de tabela e 5% de desconto passa');
select pg_temp.erro(format($$insert into public.vendas_proposta_itens (proposta_id, product_id, description, quantity, unit_price, discount_percent)
  values ('7e57a000-0000-4000-a000-00000000f001', %L, 'Café', 1, 48.5, 15)$$, current_setting('t.cafe')), 'desconto_acima_do_limite',
  'desconto de 15% no item é recusado');
select pg_temp.erro(format($$insert into public.vendas_proposta_itens (proposta_id, product_id, description, quantity, unit_price, discount_percent)
  values ('7e57a000-0000-4000-a000-00000000f001', %L, 'Café', 1, 40, 0)$$, current_setting('t.cafe')), 'preco_abaixo_da_tabela',
  'preço abaixo da tabela é recusado');
select pg_temp.erro($$update public.vendas_proposta_itens set unit_price = 10 where proposta_id = '7e57a000-0000-4000-a000-00000000f001'$$,
  'preco_abaixo_da_tabela', 'baixar o preço depois, pela API, também é recusado');
insert into public.vendas_proposta_itens (proposta_id, description, quantity, unit_price, discount_percent)
values ('7e57a000-0000-4000-a000-00000000f001', 'Item avulso', 1, 10, 10);
select pg_temp.check(true, 'item avulso com preço livre e desconto dentro do limite passa');
-- Desconto em reais que leva o total acima de 10%: valor cheio = 485 + 10 = 495; itens já dão 24,25 + 1 de desconto.
update public.vendas_propostas set discount_amount = 30 where id = '7e57a000-0000-4000-a000-00000000f001';
select pg_temp.erro($$update public.vendas_propostas set status = 'sent', sent_at = now() where id = '7e57a000-0000-4000-a000-00000000f001'$$,
  'desconto_acima_do_limite', 'enviar com desconto total acima do limite é recusado');
select pg_temp.erro($$select public.vendas_converter_proposta('7e57a000-0000-4000-a000-00000000f001')$$,
  'desconto_acima_do_limite', 'virar pedido com desconto total acima do limite também é recusado');
update public.vendas_propostas set discount_amount = 20 where id = '7e57a000-0000-4000-a000-00000000f001';
update public.vendas_propostas set status = 'sent', sent_at = now() where id = '7e57a000-0000-4000-a000-00000000f001';
select pg_temp.check((select status = 'sent' from public.vendas_propostas where id = '7e57a000-0000-4000-a000-00000000f001'),
  'dentro do limite (45,25 de 495 = 9,14%) envia normalmente');

-- ── "Visto pelo cliente" ───────────────────────────────────────────────────
select pg_temp.as_admin();
select set_config('t.token', (select public_token from public.vendas_propostas where id = '7e57a000-0000-4000-a000-00000000f001'), true);
select pg_temp.as_user(current_setting('t.rita')::uuid);
select public.vendas_proposta_publica(current_setting('t.token'));
select pg_temp.as_admin();
select pg_temp.check((select viewed_at is null from public.vendas_propostas where id = '7e57a000-0000-4000-a000-00000000f001'),
  'a representante abrindo o link não marca como visto');
select pg_temp.as_anon();
select public.vendas_proposta_publica(current_setting('t.token'));
select pg_temp.as_admin();
select pg_temp.check((select viewed_at is not null from public.vendas_propostas where id = '7e57a000-0000-4000-a000-00000000f001'),
  'o cliente abrindo o link marca como visto');

-- ── Gestão continua livre ──────────────────────────────────────────────────
select pg_temp.as_user(current_setting('t.dono')::uuid);
insert into public.vendas_propostas (id, customer_id) values ('7e57a000-0000-4000-a000-00000000f002', current_setting('t.cliente')::uuid);
insert into public.vendas_proposta_itens (proposta_id, product_id, description, quantity, unit_price, discount_percent)
values ('7e57a000-0000-4000-a000-00000000f002', current_setting('t.cafe')::uuid, 'Café torrado 1kg', 10, 30, 40);
update public.vendas_propostas set status = 'sent', sent_at = now() where id = '7e57a000-0000-4000-a000-00000000f002';
select pg_temp.check((select status = 'sent' from public.vendas_propostas where id = '7e57a000-0000-4000-a000-00000000f002'),
  'o dono dá preço e desconto livres');

rollback;
