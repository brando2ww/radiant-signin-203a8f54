create role anon;
create role authenticated;
create role service_role;
create function public.can_access_owner(uuid) returns boolean language sql as $$select false$$;
create table delivery_coupons(id uuid primary key default gen_random_uuid(),user_id uuid not null,code text unique);
create table evaluation_campaigns(id uuid primary key default gen_random_uuid(),user_id uuid,is_active boolean default true,roulette_enabled boolean default true,roulette_cooldown_hours int default 15);
create table customer_evaluations(id uuid primary key default gen_random_uuid(),campaign_id uuid,user_id uuid,customer_name text,customer_whatsapp text);
create table campaign_prizes(id uuid primary key default gen_random_uuid(),campaign_id uuid,name text,is_active boolean default true,probability numeric default 100,max_quantity int,redeemed_count int default 0,coupon_validity_days int default 30);
create table campaign_prize_wins(id uuid primary key default gen_random_uuid(),campaign_id uuid,prize_id uuid,evaluation_id uuid unique,customer_name text,customer_whatsapp text,coupon_code text unique,coupon_expires_at timestamptz,is_redeemed boolean default false,created_at timestamptz default now());
\ir ../migrations/20260808181000_register_prize_win_rpc.sql
\ir ../migrations/20261029150000_cupons_por_estabelecimento.sql
\ir ../migrations/20261029160000_avaliacao_cupom_recuperavel.sql
create function pg_temp.check_it(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FALHOU: %',label; end if; raise notice 'OK: %',label; end$$;
insert into delivery_coupons(user_id,code) values('00000000-0000-0000-0000-000000000001','KOTEN12'),('00000000-0000-0000-0000-000000000002','KOTEN12');
select pg_temp.check_it((select count(*)=2 from delivery_coupons where code='KOTEN12'),'lojas diferentes repetem o código');
do $$begin
 begin insert into delivery_coupons(user_id,code) values('00000000-0000-0000-0000-000000000001','KOTEN12');raise exception 'Aceitou duplicado na mesma loja';
 exception when unique_violation then raise notice 'OK: duplicidade na mesma loja bloqueada'; end;
end$$;
insert into evaluation_campaigns(id,user_id) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
insert into campaign_prizes(id,campaign_id,name) values('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Prêmio A'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Prêmio B');
insert into customer_evaluations(id,campaign_id,user_id,customer_name,customer_whatsapp)
select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Cliente '||n,case when n=2 then '+55 (54) 99999-0001' else '5499999'||lpad(n::text,4,'0') end from generate_series(1,6)n;
set role anon;
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000001')->>'status'='issued','sem sorteio local preservado, servidor emite prêmio após avaliação');
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000001')->>'status'='issued','repetição da chamada retorna o mesmo cupom');
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000002')->>'status'='cooldown','intervalo é aplicado ao telefone normalizado');
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000003')->>'status'='issued','outro cliente no mesmo aparelho pode ganhar');
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000002')->>'status'='unavailable','prêmio de outra campanha é recusado');
reset role;
select pg_temp.check_it((select redeemed_count=2 from campaign_prizes where id='20000000-0000-0000-0000-000000000001'),'tentativa repetida não duplica contador');
select pg_temp.check_it((select count(*)=1 from campaign_prize_wins where evaluation_id='30000000-0000-0000-0000-000000000001'),'um cupom por avaliação');
update campaign_prizes set max_quantity=2 where id='20000000-0000-0000-0000-000000000001';
set role anon;
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000005')->>'status'='unavailable','estoque de prêmio esgotado não é ultrapassado');
reset role;
update evaluation_campaigns set roulette_enabled=false where id='10000000-0000-0000-0000-000000000001';
set role anon;
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000006')->>'status'='disabled','não cria prêmio para campanha sem roleta');
select pg_temp.check_it(evaluation_reward_issue('30000000-0000-0000-0000-000000000001')->>'status'='issued','cupom já emitido continua recuperável após desativação');
reset role;
