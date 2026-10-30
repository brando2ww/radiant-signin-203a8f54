-- Executado somente no PostgreSQL descartável de scripts/test-historico-comandas.mjs.
set time zone 'UTC';
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
grant usage on schema public, auth to authenticated;
create function public.pdv_cashback_pode(p_owner uuid) returns boolean language sql stable as $$
  select auth.uid() = p_owner or (p_owner='00000000-0000-0000-0000-000000000001'::uuid and auth.uid() in ('00000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-000000000004'::uuid))
$$;
create function public.has_pdv_action(p_user uuid,p_action text) returns boolean language sql stable as $$
  select p_user is not null and p_user <> '00000000-0000-0000-0000-000000000004'::uuid and p_action='view_history'
$$;
create table pdv_comandas(id uuid primary key default gen_random_uuid(), user_id uuid, order_id uuid, comanda_number text, customer_name text, customer_phone text, created_at timestamptz, updated_at timestamptz, subtotal numeric, status text, notes text);
create table pdv_orders(id uuid primary key, user_id uuid, table_id uuid, order_number text, source text, status text, discount numeric, service_fee numeric, service_fee_paid numeric);
create table pdv_tables(id uuid primary key,user_id uuid,table_number text,is_virtual boolean,is_active boolean,current_order_id uuid);
create table pdv_payments(id uuid primary key default gen_random_uuid(),order_id uuid,amount numeric,payment_method text,processed_at timestamptz,created_at timestamptz,cash_received numeric,change_amount numeric);
create table pdv_cashier_sessions(id uuid primary key,user_id uuid,closed_at timestamptz);
create table pdv_cashier_movements(id uuid primary key default gen_random_uuid(),cashier_session_id uuid,comanda_id uuid,type text,amount numeric,payment_method text,created_at timestamptz,discount_reason text);
create table pdv_comanda_items(id uuid primary key default gen_random_uuid(),comanda_id uuid,product_name text,quantity numeric,unit_price numeric,subtotal numeric,notes text,parent_item_id uuid,is_composite_child boolean,created_at timestamptz);
create table pdv_cashback_usos(user_id uuid,comanda_id uuid,valor numeric,status text);
create table pdv_cancelled_comanda_items(id uuid primary key default gen_random_uuid(),comanda_id uuid,product_name text,quantity numeric,subtotal numeric,cancellation_reason text,cancelled_at timestamptz);
\ir ../migrations/20261028120000_historico_comandas_fechadas.sql
create function pg_temp.check_it(ok boolean,label text) returns void language plpgsql as $$begin
  if ok is not true then raise exception 'FALHOU: %',label; end if;
  raise notice 'OK: %',label;
end$$;
insert into pdv_tables values
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','06',false,false,null),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','Balcão',true,true,null);
insert into pdv_orders values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','P001','salao','fechada',10,15,15),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','P002','balcao','fechada',0,0,0);
insert into pdv_comandas values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','001','Érica','+55 (89) 99999-0001','2026-10-27 20:00Z','2026-10-28 01:00Z',100,'fechada','Sem cebola'),
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','002','João','89999990002','2026-10-27 20:00Z','2026-10-28 02:59:59Z',50,'fechada',null),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',null,'003','Avulsa','89999990003','2026-10-28 03:00Z','2026-10-28 03:00Z',30,'fechada',null),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000001',null,'004','Aberta',null,'2026-10-28','2026-10-28',99,'aberta',null),
 ('10000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000001',null,'005','Cancelada',null,'2026-10-28','2026-10-28',99,'cancelada',null),
 ('10000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000002',null,'006','Outra loja',null,'2026-10-28','2026-10-28',999,'fechada',null),
 ('10000000-0000-0000-0000-000000000007','00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','007','Balcão',null,'2026-10-28','2026-10-28',12,'fechada',null),
 ('10000000-0000-0000-0000-000000000008','00000000-0000-0000-0000-000000000001',null,'008','Antiga',null,'2025-01-01','2025-01-01',20,'fechada',null);
insert into pdv_comanda_items values
 ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Galinha',1,100,100,'Inteira',null,false,'2026-10-27'),
 ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Complemento',1,999,999,null,'40000000-0000-0000-0000-000000000001',true,'2026-10-27'),
 ('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000006','Produto sigiloso',1,999,999,null,null,false,'2026-10-27');
insert into pdv_cashier_sessions values ('50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','2026-10-28');
insert into pdv_cashier_movements(cashier_session_id,comanda_id,type,amount,payment_method,created_at) values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','venda',100,'pix','2026-10-28 01:00Z'),
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','venda',30,'dinheiro','2026-10-28 03:00Z');
insert into pdv_payments(order_id,amount,payment_method,created_at,cash_received,change_amount) values
 ('30000000-0000-0000-0000-000000000001',100,'pix','2026-10-28 01:00Z',null,null),
 ('30000000-0000-0000-0000-000000000001',55,'dinheiro','2026-10-28 02:59:59Z',60,5);
insert into pdv_cashback_usos values('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',5,'ativo');
insert into pdv_cancelled_comanda_items(comanda_id,product_name,quantity,subtotal,cancellation_reason,cancelled_at) values('10000000-0000-0000-0000-000000000001','Suco',1,8,'Desistência','2026-10-27');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001')->>'total')::int=5,'inclui mesa e avulsa, histórico antigo e exclui abertas/canceladas/outra loja');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001','2026-10-27','2026-10-27')->>'total')::int=3,'período inclui todo dia do Brasil, inclusive 02:59:59 UTC no dia seguinte');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001','2026-10-28','2026-10-28')->>'total')::int=1,'03h UTC inicia novo dia no Brasil');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'Mesa 06')->>'total')::int=2,'busca mesa que já foi liberada e desativada');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'ÉRICA')->>'total')::int=1,'busca cliente sem diferenciar maiúsculas');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'erica')->>'total')::int=1,'busca cliente sem exigir acentos');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'Mesa 6')->>'total')::int=2,'mesa com ou sem zero à esquerda');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'89999990001')->>'total')::int=1,'busca telefone com ou sem máscara');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'P001')->>'total')::int=2,'busca número de atendimento encontra todas as comandas associadas');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'001')->'comandas'->0->>'valor_pago')::numeric=155,'cobrança usa pagamentos reais e não soma novamente movimento de caixa');
select pg_temp.check_it(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'001')->'comandas'->0->>'pagamento_escopo'='atendimento','pagamento compartilhado é identificado como atendimento');
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'Avulsa')->'comandas'->0->>'valor_pago')::numeric=30,'avulsa recupera movimento de caixa antigo já fechado');
select pg_temp.check_it(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'Antiga')->'comandas'->0->>'valor_pago' is null,'ausência de pagamento preservado não vira consumo nem zero recebido');
select pg_temp.check_it(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'007')->'comandas'->0->>'local'='Balcão','identifica mesa virtual de balcão');
select pg_temp.check_it(jsonb_array_length(pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->'itens')=2,'carrega itens antigos e complementos, preservando observações');
select pg_temp.check_it(pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->'itens'->1->>'complemento'='true','complemento não é tratado como item de cobrança adicional');
select pg_temp.check_it(jsonb_array_length(pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->'pagamentos_atendimento')=2,'detalhe recupera múltiplas formas e pagamentos parciais');
select pg_temp.check_it(jsonb_array_length(pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->'comandas_atendimento')=2,'lista comandas irmãs do atendimento');
select pg_temp.check_it((pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->>'cashback_usado')::numeric=5,'cashback utilizado visível sem nova cobrança');
select pg_temp.check_it(jsonb_array_length(pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->'cancelados')=1,'itens cancelados aparecem separados');
do $$begin perform pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000006');raise exception 'FALHOU: vazou detalhe de outra loja';exception when no_data_found then raise notice 'OK: detalhe de outra loja bloqueado';end$$;
do $$begin perform pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004');raise exception 'FALHOU: comanda aberta consultada como fechada';exception when no_data_found then raise notice 'OK: detalhe só permite comandas fechadas';end$$;
do $$begin perform pdv_historico_comandas('00000000-0000-0000-0000-000000000001','2026-10-28','2026-10-01');raise exception 'FALHOU: aceitou datas invertidas';exception when invalid_parameter_value then raise notice 'OK: intervalo inválido rejeitado';end$$;
reset role;
insert into pdv_comandas(user_id,comanda_number,status,created_at,updated_at,subtotal) select '00000000-0000-0000-0000-000000000001',n::text,'fechada','2026-01-01','2026-01-01',1 from generate_series(100,1204) n;
set role authenticated;
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001')->>'total')::int=1110,'contagem acima de 1000 registros não é truncada pelo PostgREST');
select pg_temp.check_it(jsonb_array_length(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'',0,1000)->'comandas')=100,'limite máximo de 100 por página');
select pg_temp.check_it(jsonb_array_length(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'',1100,50)->'comandas')=10,'última página disponível além dos primeiros 1000 registros');
select pg_temp.check_it(not exists(select 1 from jsonb_array_elements(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'',0,50)->'comandas') a cross join jsonb_array_elements(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'',50,50)->'comandas') b where a->>'id'=b->>'id'),'paginação estável em registros com mesmo horário');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
set role authenticated;
select pg_temp.check_it((pdv_historico_comandas('00000000-0000-0000-0000-000000000001')->>'total')::int=1110,'equipe com permissão consulta histórico da loja');
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000004',false);
set role authenticated;
do $$begin perform pdv_historico_comandas('00000000-0000-0000-0000-000000000001');raise exception 'FALHOU: perfil bloqueado consultou histórico';exception when insufficient_privilege then raise notice 'OK: permissão view_history respeitada no servidor';end$$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
set role authenticated;
do $$begin perform pdv_historico_comandas('00000000-0000-0000-0000-000000000001');raise exception 'FALHOU: outra loja leu histórico';exception when insufficient_privilege then raise notice 'OK: isolamento de histórico por loja';end$$;
reset role;
select pg_temp.check_it(not has_function_privilege('anon','public.pdv_historico_comandas(uuid,date,date,text,integer,integer)','execute'),'anônimo não consulta histórico');
select pg_temp.check_it(not has_table_privilege('authenticated','pdv_comandas','update'),'consulta não exige permissão para alterar vendas');
-- Mesmo um vínculo inconsistente com pedido de outra loja não revela sua cobrança.
reset role;
insert into pdv_orders values('30000000-0000-0000-0000-000000000099','00000000-0000-0000-0000-000000000002',null,'SIGILOSO','salao','fechada',0,0,0);
insert into pdv_payments(order_id,amount,payment_method) values('30000000-0000-0000-0000-000000000099',9999,'pix');
insert into pdv_comandas(user_id,order_id,comanda_number,status,created_at,updated_at,subtotal,customer_name) values('00000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000099','099','fechada','2026-10-28','2026-10-28',1,'Vínculo inconsistente');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
set role authenticated;
select pg_temp.check_it(pdv_historico_comandas('00000000-0000-0000-0000-000000000001',null,null,'Vínculo inconsistente')->'comandas'->0->>'valor_pago' is null,'vínculo inconsistente não revela pagamento de outra loja');

reset role;
create table pdv_settings(user_id uuid primary key,business_name text,business_cnpj text,business_address text,business_phone text,nfe_enable_nfce boolean,nfe_certificate_password text,nfe_csc_token text);
insert into pdv_settings values('00000000-0000-0000-0000-000000000001','Loja A','123','Rua A','999',true,'SEGREDO','CSC-SECRETO');
\ir ../migrations/20261029153000_historico_reimpressao.sql
\ir ../migrations/20261029173000_pdv_settings_operacionais.sql
set role authenticated;
select pg_temp.check_it(pdv_historico_comanda_detalhe('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001')->'business'->>'name'='Loja A','reimpressão usa a identificação da loja correta');
select pg_temp.check_it((pdv_settings_operacionais('00000000-0000-0000-0000-000000000001')->>'nfe_enable_nfce')::boolean,'parâmetro fiscal operacional é consultável');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',false);
select pg_temp.check_it(pdv_settings_operacionais('00000000-0000-0000-0000-000000000001')->>'business_name'='Loja A','equipe usa configuração da loja em vez de configuração pessoal vazia');
select pg_temp.check_it(not(pdv_settings_operacionais('00000000-0000-0000-0000-000000000001')?'nfe_certificate_password') and not(pdv_settings_operacionais('00000000-0000-0000-0000-000000000001')?'nfe_csc_token'),'equipe não recebe senha A1 nem CSC');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$begin perform pdv_settings_operacionais('00000000-0000-0000-0000-000000000001');raise exception 'Outra loja consultou configuração';exception when insufficient_privilege then raise notice 'OK: configuração operacional isolada por loja';end$$;
reset role;
select pg_temp.check_it(not has_function_privilege('anon','public.pdv_settings_operacionais(uuid)','execute'),'anônimo não consulta parâmetros do caixa');
