-- Apenas pelo runner scripts/test-clientes-cashback.mjs, em PostgreSQL descartável.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create function public.is_establishment_member(p_owner uuid) returns boolean language sql stable as $$
  select auth.uid() = '00000000-0000-0000-0000-000000000003'::uuid
     and p_owner = '00000000-0000-0000-0000-000000000001'::uuid
$$;
create function public.pdv_cashback_pode(p_owner uuid) returns boolean language sql stable as $$
  select auth.uid() is not null and (auth.uid() = p_owner or public.is_establishment_member(p_owner))
$$;
create function public.pdv_telefone_normalizado(p_telefone text) returns text language sql immutable as $$
  select case when d ~ '^\d{10,11}$' then d end
    from (select case when x ~ '^55\d{10,11}$' then substr(x, 3) else x end as d
      from (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as x) a) b
$$;
create table public.pdv_customers (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null,
  phone text, email text, created_at timestamptz default now()
);
alter table public.pdv_customers enable row level security;
grant usage on schema public, auth to authenticated;
grant select on public.pdv_customers to authenticated;
create table public.pdv_comandas (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  customer_name text, customer_phone text, status text default 'fechada',
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create table public.pdv_settings (user_id uuid, cashback_ativo boolean);
create table public.mesa_sessoes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null,
  nome text, celular text, criada_em timestamptz default now()
);
create table public.pdv_cashback_creditos (
  user_id uuid, telefone text, restante numeric, vence_em date
);
create function pg_temp.check_it(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FALHOU: %', p_name; end if;
  raise notice 'OK: %', p_name;
end $$;

insert into public.pdv_customers(user_id, name, phone, email) values
  ('00000000-0000-0000-0000-000000000001', 'Cadastro manual', '+55 (54) 99999-0000', 'preservar@example.com');
insert into public.pdv_comandas(id, user_id, customer_name, customer_phone, updated_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Nome na comanda', '54999990000', '2026-10-01'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Novo cliente', '(54) 99999-0001', '2026-10-02'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Mesmo telefone', '+55 54 99999-0001', '2026-10-03'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000002', 'Outra loja', '54999990001', '2026-10-04'),
  ('10000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Só nome', null, '2026-10-05'),
  ('10000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', '  ', '  ', '2026-10-06'),
  ('10000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', null, '(54) 99999-0002', '2026-10-07'),
  ('10000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'Telefone incompleto', '54999', '2026-10-08');

\ir ../migrations/20261026150000_clientes_das_comandas.sql

select pg_temp.check_it((select count(*) = 3 from pdv_customers), 'importa somente histórico com nome E telefone válido, sem duplicar telefones');
select pg_temp.check_it((select count(*) = 4 from pdv_clientes_comandas), 'vincula somente comandas com dados completos');
select pg_temp.check_it(not exists(select 1 from pdv_customers where name in ('Só nome', 'Telefone incompleto') or phone = '54999990002'), 'ignora nome sozinho, telefone sozinho e telefone incompleto');
select pg_temp.check_it((select count(*) = 1 from pdv_customers where phone = '54999990001' and user_id = '00000000-0000-0000-0000-000000000001'), 'normaliza DDD, máscara e prefixo 55');
select pg_temp.check_it((select name = 'Cadastro manual' and email = 'preservar@example.com' from pdv_customers where phone = '+55 (54) 99999-0000'), 'preserva cadastro manual');
select pg_temp.check_it((select updated_at = '2026-10-01'::timestamptz from pdv_comandas where id = '10000000-0000-0000-0000-000000000001'), 'preserva data da comanda para não gerar cashback retroativo');
select pg_temp.check_it((select count(*) = 1 from pdv_customers where user_id = '00000000-0000-0000-0000-000000000002'), 'mesmo telefone em outra loja é outro cadastro');

-- Repetir a migration também repete a importação e não deve duplicar clientes.
\ir ../migrations/20261026150000_clientes_das_comandas.sql
select pg_temp.check_it((select count(*) = 3 from pdv_customers), 'repetir importação não duplica cadastros nem importa dados incompletos');
update pdv_comandas set customer_phone = '(54) 99999-0003' where id = '10000000-0000-0000-0000-000000000005';
select pg_temp.check_it((select count(*) = 4 from pdv_customers), 'adicionar telefone importa o contato que antes tinha só nome');
select pg_temp.check_it((select phone = '54999990003' from pdv_customers where name = 'Só nome'), 'sincroniza o telefone preenchido depois no caixa');
update pdv_comandas set customer_name = 'Nome informado depois' where id = '10000000-0000-0000-0000-000000000007';
select pg_temp.check_it((select name = 'Nome informado depois' from pdv_customers where phone = '54999990002'), 'importa somente depois de completar o nome que faltava');
insert into pdv_comandas(user_id, customer_name, customer_phone, status) values
  ('00000000-0000-0000-0000-000000000001', 'Nome repetido', '54999990002', 'aberta');
select pg_temp.check_it((select count(*) = 5 from pdv_customers), 'comanda futura reutiliza cliente já importado');
insert into pdv_comandas(user_id, customer_name, customer_phone, status) values
  ('00000000-0000-0000-0000-000000000001', 'Cliente futuro', '54999990004', 'aberta');
select pg_temp.check_it((select count(*) = 6 from pdv_customers), 'comanda nova cadastra cliente completo mesmo antes do pagamento');
update pdv_comandas set customer_phone = '54999990005' where id = '10000000-0000-0000-0000-000000000002';
select pg_temp.check_it((select count(*) = 1 from pdv_customers where phone = '54999990001' and user_id = '00000000-0000-0000-0000-000000000001'), 'troca de pessoa na comanda preserva o contato antigo');

insert into pdv_settings values ('00000000-0000-0000-0000-000000000001', true), ('00000000-0000-0000-0000-000000000002', true);
insert into pdv_cashback_creditos values
  ('00000000-0000-0000-0000-000000000001', '54999990001', 20, (now() at time zone 'America/Sao_Paulo')::date),
  ('00000000-0000-0000-0000-000000000001', '54999990001', 7.5, (now() at time zone 'America/Sao_Paulo')::date + 10),
  ('00000000-0000-0000-0000-000000000001', '54999990001', 100, (now() at time zone 'America/Sao_Paulo')::date - 1),
  ('00000000-0000-0000-0000-000000000001', '54999990001', 0, (now() at time zone 'America/Sao_Paulo')::date + 10),
  ('00000000-0000-0000-0000-000000000002', '54999990001', 999, (now() at time zone 'America/Sao_Paulo')::date + 10);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select pg_temp.check_it((select saldo = 27.5 and vence_em = (now() at time zone 'America/Sao_Paulo')::date from pdv_clientes_cashback('00000000-0000-0000-0000-000000000001')), 'saldo soma apenas restante não vencido da loja e inclui vencimento hoje');
do $$
begin
  perform * from pdv_clientes_cashback('00000000-0000-0000-0000-000000000002');
  raise exception 'FALHOU: dono leu o cashback de outra loja';
exception when insufficient_privilege then raise notice 'OK: bloqueia leitura de outra loja';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', false);
set role authenticated;
select pg_temp.check_it((select count(*) = 6 from pdv_customers), 'equipe só enxerga clientes da própria loja');
select pg_temp.check_it((select saldo = 27.5 from pdv_clientes_cashback('00000000-0000-0000-0000-000000000001')), 'equipe pode consultar saldo da sua loja');
reset role;
update pdv_settings set cashback_ativo = false where user_id = '00000000-0000-0000-0000-000000000001';
select pg_temp.check_it((select count(*) = 0 from pdv_clientes_cashback('00000000-0000-0000-0000-000000000001')), 'cashback desligado não aparece como ativo');
select pg_temp.check_it(not has_function_privilege('anon', 'public.pdv_clientes_cashback(uuid)', 'execute'), 'anônimo não pode ler cashback');
select pg_temp.check_it(not has_function_privilege('authenticated', 'public.pdv_cliente_da_comanda(public.pdv_comandas)', 'execute'), 'cliente não pode forjar importação de outra loja');
select pg_temp.check_it(not has_table_privilege('authenticated', 'public.pdv_clientes_comandas', 'select'), 'vínculos internos não são expostos');

create temp table antes_sessoes as select count(*) as total from pdv_customers;
alter table mesa_sessoes disable trigger pdv_mesa_sessao_salvar_cliente;
insert into mesa_sessoes(user_id, nome, celular) values
  ('00000000-0000-0000-0000-000000000001', 'Já cadastrado', '+55 (54) 99999-0001'),
  ('00000000-0000-0000-0000-000000000001', 'Contato antigo do QR', '54999990009');
\ir ../migrations/20261026150000_clientes_das_comandas.sql
select pg_temp.check_it((select count(*) = (select total + 1 from antes_sessoes) from pdv_customers), 'recupera contato antigo que só estava na sessão do QR, sem duplicar o existente');
insert into mesa_sessoes(user_id, nome, celular) values
  ('00000000-0000-0000-0000-000000000001', 'Contato futuro do QR', '54999990008');
select pg_temp.check_it((select count(*) = (select total + 2 from antes_sessoes) from pdv_customers), 'preserva automaticamente novos contatos de sessões do QR');
select pg_temp.check_it(not has_function_privilege('authenticated', 'public.pdv_preservar_contato_cliente(uuid,text,text,timestamptz)', 'execute'), 'helper de importação não pode ser chamado diretamente pela API');

create temp table antes_rotulos as select count(*) as total from pdv_customers;
insert into pdv_comandas(user_id, customer_name) values
  ('00000000-0000-0000-0000-000000000001', 'Mesa 4'),
  ('00000000-0000-0000-0000-000000000001', 'Pessoa 1'),
  ('00000000-0000-0000-0000-000000000001', 'Balcão');
select pg_temp.check_it((select count(*) = (select total from antes_rotulos) from pdv_customers), 'rótulos de mesa e pessoa sem contato não viram clientes');
insert into pdv_comandas(user_id, customer_name, customer_phone) values
  ('00000000-0000-0000-0000-000000000001', 'Mesa 5', '54999990006');
select pg_temp.check_it(not exists(select 1 from pdv_customers where phone = '54999990006'), 'telefone com rótulo genérico não substitui um nome de cliente');
insert into mesa_sessoes(user_id, nome, celular) values
  ('00000000-0000-0000-0000-000000000001', null, '54999990006'),
  ('00000000-0000-0000-0000-000000000001', 'Sem telefone no QR', null);
select pg_temp.check_it(not exists(select 1 from pdv_customers where phone = '54999990006' or name = 'Sem telefone no QR'), 'sessões do QR também exigem nome e telefone completos');
