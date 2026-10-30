-- Banco local descartável, executado por scripts/test-clientes-consumo.mjs.
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
grant usage on schema public, auth to authenticated;
create table establishment_users(user_id uuid, establishment_owner_id uuid, is_active boolean, role text);
create function public.is_establishment_member(p_owner uuid) returns boolean language sql stable security definer as $$
  select exists(select 1 from establishment_users where user_id = auth.uid() and establishment_owner_id = p_owner and is_active)
$$;
create table pdv_settings(id uuid default gen_random_uuid(), user_id uuid unique, nfe_csc_token text);
create table pdv_customers(id uuid primary key, user_id uuid, phone text);
create table pdv_orders(id uuid primary key, user_id uuid, customer_id uuid, order_number text, status text, total numeric, updated_at timestamptz);
create table pdv_comandas(id uuid primary key default gen_random_uuid(), user_id uuid, order_id uuid, comanda_number text, customer_name text, customer_phone text, status text, subtotal numeric, updated_at timestamptz);
create table pdv_comanda_items(comanda_id uuid, subtotal numeric, parent_item_id uuid);
create table pdv_cashier_movements(comanda_id uuid, type text, amount numeric);
create table delivery_orders(id uuid primary key, user_id uuid, customer_phone text, order_number text, status text, payment_status text, total numeric, delivered_at timestamptz, updated_at timestamptz);
create schema cron;
create table cron.job(jobname text);
create function cron.unschedule(text) returns boolean language sql as $$select true$$;
create function cron.schedule(text,text,text) returns integer language sql as $$select 1$$;
\ir ../migrations/20261020200000_cashback_salao.sql
\ir ../migrations/20261028110000_clientes_consumo_config_cashback.sql

create function pg_temp.check_it(ok boolean, label text) returns void language plpgsql as $$begin
  if ok is not true then raise exception 'FALHOU: %', label; end if;
  raise notice 'OK: %', label;
end$$;
begin;
insert into establishment_users values
 ('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',true,'gerente'),
 ('00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',true,'caixa'),
 ('00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',false,'gerente');
insert into pdv_settings(user_id,nfe_csc_token) values ('00000000-0000-0000-0000-000000000001','NAO-EXPOR');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select pg_temp.check_it((pdv_cashback_configuracao('00000000-0000-0000-0000-000000000001')->>'ativo')::boolean = false, 'publicação não ativa o programa');
select pg_temp.check_it(not (pdv_cashback_configuracao('00000000-0000-0000-0000-000000000001') ? 'nfe_csc_token'), 'consulta não revela configurações fiscais');
select pg_temp.check_it((pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,10,30)->>'pode_configurar')::boolean, 'proprietário configura 10% e 30 dias');
reset role;
select pg_temp.check_it((select cashback_inicio_em = now() and nfe_csc_token = 'NAO-EXPOR' from pdv_settings where user_id='00000000-0000-0000-0000-000000000001'), 'ativação marca início e preserva demais configurações');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
set role authenticated;
select pg_temp.check_it((pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,15,60)->>'percentual')::numeric = 15, 'gerente altera percentual e validade da loja, sem configuração própria');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
set role authenticated;
select pg_temp.check_it((pdv_cashback_configuracao('00000000-0000-0000-0000-000000000001')->>'pode_configurar')::boolean = false, 'caixa pode consultar mas não configurar');
do $$begin
  perform pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,99,365);
  raise exception 'FALHOU: caixa alterou programa';
exception when insufficient_privilege then raise notice 'OK: servidor bloqueia edição pelo caixa'; end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
do $$begin
  perform pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,0,30);
  raise exception 'FALHOU: aceitou percentual inválido';
exception when invalid_parameter_value then raise notice 'OK: percentual inválido rejeitado'; end$$;
do $$begin
  perform pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,10,366);
  raise exception 'FALHOU: aceitou validade inválida';
exception when invalid_parameter_value then raise notice 'OK: validade inválida rejeitada'; end$$;
select pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,10,30);

insert into pdv_comandas(id,user_id,comanda_number,customer_name,customer_phone,status,subtotal,updated_at) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','1','Cliente A','+55 (54) 99999-0001','fechada',100,now()-interval '1 hour'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','2','Cliente B','54999990002','fechada',100,now()-interval '1 hour'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','3','Cliente C','54999990003','fechada',100,now()-interval '1 hour'),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','4','Cortesia','54999990004','fechada',100,now()-interval '1 hour'),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001','5','Aberta','54999990005','aberta',100,now()-interval '1 hour'),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000001','6','Cancelada','54999990006','cancelada',100,now()-interval '1 hour'),
 ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','7','Muito recente','54999990007','fechada',100,now()),
 ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001','8','Sem telefone',null,'fechada',100,now()-interval '1 hour');
insert into pdv_comanda_items select id,100,null from pdv_comandas;
insert into pdv_comanda_items values('10000000-0000-0000-0000-000000000001',999,'90000000-0000-0000-0000-000000000001');
insert into pdv_cashier_movements select id,'venda',case when comanda_number='4' then 0 when comanda_number='2' then 80 else 100 end from pdv_comandas;
insert into pdv_cashback_usos(user_id,telefone,comanda_id,valor) values ('00000000-0000-0000-0000-000000000001','54999990003','10000000-0000-0000-0000-000000000003',20);
select pg_temp.check_it(pdv_cashback_gerar()=0,'ativação não gera crédito para vendas anteriores');
update pdv_settings set cashback_inicio_em=now()-interval '2 hours';
select pg_temp.check_it(pdv_cashback_gerar()=3,'gera somente contas pagas elegíveis e espera gravação do pagamento');
select pg_temp.check_it((select valor=10 and base=100 and telefone='54999990001' and vence_em=(now() at time zone 'America/Sao_Paulo')::date+30 from pdv_cashback_creditos where comanda_id='10000000-0000-0000-0000-000000000001'),'10% do consumo sem duplicar itens filhos, telefone normalizado e prazo correto');
select pg_temp.check_it((select valor=8 and base=80 from pdv_cashback_creditos where comanda_id='10000000-0000-0000-0000-000000000002'),'crédito limitado ao que foi pago, sem gerar sobre desconto');
select pg_temp.check_it((select valor=8 and base=80 from pdv_cashback_creditos where comanda_id='10000000-0000-0000-0000-000000000003'),'parte paga com cashback não gera novo crédito');
select pg_temp.check_it(pdv_cashback_gerar()=0 and (select count(*)=3 from pdv_cashback_creditos),'repetição da rotina não duplica créditos');
select pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,20,60);
select pg_temp.check_it((select bool_and(valor in(8,10) and vence_em=(now() at time zone 'America/Sao_Paulo')::date+30) from pdv_cashback_creditos),'alterar regra preserva valores e vencimentos de créditos emitidos');
select pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',false,20,60);
select pg_temp.check_it(pdv_cashback_gerar()=0,'desativado não gera crédito');
select pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,10,30);
select pg_temp.check_it((select cashback_inicio_em=now() from pdv_settings),'reativação não recupera vendas do intervalo desativado');

-- Um pedido-pai com comanda não pode ser somado novamente no histórico.
insert into pdv_customers values('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','54999990001');
insert into pdv_orders values('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','P1','fechada',100,now());
update pdv_comandas set order_id='20000000-0000-0000-0000-000000000001' where comanda_number='1';
insert into pdv_orders values('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','P2','fechado',25,now());
insert into delivery_orders values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','+55 54 99999-0001','D1','completed','paid',75,now(),now()),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','54999990001','D2','completed','paid',999,now(),now()),
 ('30000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001','54999990001','D3','cancelled','paid',999,now(),now()),
 ('30000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001','54999990001','D4','completed','pending',999,now(),now());
set role authenticated;
select pg_temp.check_it((select sum(valor)=125 and count(*)=2 from pdv_clientes_consumos('00000000-0000-0000-0000-000000000001') where telefone='54999990001' and canal='pdv'),'histórico recupera comandas e pedidos legados sem somar o pedido-pai duas vezes');
select pg_temp.check_it((select sum(valor)=75 and count(*)=1 from pdv_clientes_consumos('00000000-0000-0000-0000-000000000001') where canal='delivery'),'delivery separado, pago e concluído, isolado da outra loja');
select pg_temp.check_it((select count(*)=3 from pdv_clientes_creditos('00000000-0000-0000-0000-000000000001')),'histórico dos créditos disponível para filtros de vencimento');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$begin
 perform * from pdv_clientes_consumos('00000000-0000-0000-0000-000000000001');
 raise exception 'FALHOU: outra loja leu clientes';
exception when insufficient_privilege then raise notice 'OK: bloqueia leitura de consumo de outra loja';end$$;
do $$begin
 perform * from pdv_clientes_creditos('00000000-0000-0000-0000-000000000001');
 raise exception 'FALHOU: outra loja leu carteira';
exception when insufficient_privilege then raise notice 'OK: bloqueia leitura de carteira de outra loja';end$$;
do $$begin
 perform pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,99,365);
 raise exception 'FALHOU: outra loja configurou cashback';
exception when insufficient_privilege then raise notice 'OK: bloqueia edição de outra loja';end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',false);
do $$begin
 perform pdv_cashback_configurar('00000000-0000-0000-0000-000000000001',true,99,365);
 raise exception 'FALHOU: gerente inativo alterou configuração';
exception when insufficient_privilege then raise notice 'OK: gerente inativo não configura';end$$;
select pg_temp.check_it(not has_function_privilege('anon','public.pdv_clientes_consumos(uuid)','execute') and not has_function_privilege('anon','public.pdv_cashback_configurar(uuid,boolean,numeric,integer)','execute'),'anônimos não consultam clientes nem configuram programa');
commit;
