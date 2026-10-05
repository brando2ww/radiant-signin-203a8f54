-- Remoção da Força de vendas do Velara (05/10/2026). O módulo foi construído aqui por engano: o pedido do dono era um
-- módulo de vendas da Sellgrid Gestão (gestao.sellgrid.com.br). Nenhuma empresa real usou (só o estabelecimento de teste,
-- com dados fictícios, que também sai). Volta tudo como era antes de 20261005120000:
--   · regra de clientes só do dono ("Gestão de clientes PDV") e financeiro sem a regra de gerente/financeiro;
--   · sem as colunas novas em clientes, produtos e financeiro; sem as tabelas e funções vendas_*.
-- O valor 'representante' do enum app_role fica (o Postgres não remove valor de enum sem recriar o tipo); nenhum usuário o usa.

-- 1. Estabelecimento de teste (dados fictícios)
do $$
declare v_dono uuid := '8884ffd9-22a5-4e6d-9e02-82d81ee660b3'; v_tenant uuid := '7e57a000-0000-4000-a000-000000000001';
begin
  delete from public.vendas_comissoes where user_id = v_dono;
  delete from public.vendas_agenda where user_id = v_dono;
  update public.vendas_propostas set order_id = null where user_id = v_dono;
  delete from public.vendas_pedidos where user_id = v_dono;
  delete from public.vendas_propostas where user_id = v_dono;
  delete from public.pdv_financial_transactions where user_id = v_dono;
  delete from public.pdv_customers where user_id = v_dono;
  delete from public.pdv_products where user_id = v_dono;
  delete from public.vendas_representantes where user_id = v_dono;
  delete from public.vendas_asaas where user_id = v_dono;
  delete from public.vendas_numeracao where user_id = v_dono;
  delete from public.establishment_users where establishment_owner_id = v_dono;
  delete from public.tenant_modules where tenant_id = v_tenant;
  delete from public.tenants where id = v_tenant;
  delete from public.business_settings where user_id = v_dono;
  delete from public.pdv_settings where user_id = v_dono;
end $$;

-- 2. Gatilhos e regras de acesso nas tabelas do PDV
drop trigger if exists vendas_cliente_novo on public.pdv_customers;
drop trigger if exists vendas_comissao on public.pdv_financial_transactions;
drop policy if exists "Dono e equipe gerenciam clientes" on public.pdv_customers;
drop policy if exists "Representante gerencia a própria carteira" on public.pdv_customers;
create policy "Gestão de clientes PDV" on public.pdv_customers for all using (auth.uid() = user_id);
drop policy if exists "Gerente e financeiro da empresa" on public.pdv_financial_transactions;

-- 3. Tabelas do módulo (as colunas que apontam para elas caem junto no passo 4)
drop table if exists public.vendas_comissoes, public.vendas_agenda, public.vendas_pedido_itens, public.vendas_proposta_itens cascade;
drop table if exists public.vendas_propostas, public.vendas_pedidos cascade;
drop table if exists public.vendas_representantes, public.vendas_asaas, public.vendas_numeracao cascade;

-- 4. Colunas acrescentadas
alter table public.pdv_customers
  drop column if exists person_type, drop column if exists cnpj, drop column if exists company_name, drop column if exists trade_name,
  drop column if exists state_registration, drop column if exists contact_name, drop column if exists whatsapp, drop column if exists cep,
  drop column if exists street, drop column if exists address_number, drop column if exists complement, drop column if exists district,
  drop column if exists city, drop column if exists state, drop column if exists ibge_code, drop column if exists representative_id,
  drop column if exists payment_terms, drop column if exists credit_limit, drop column if exists is_b2b, drop column if exists asaas_customer_id;
alter table public.pdv_products
  drop column if exists b2b_enabled, drop column if exists price_b2b, drop column if exists sku, drop column if exists sales_unit,
  drop column if exists min_qty, drop column if exists pack_qty, drop column if exists gallery;
alter table public.pdv_financial_transactions
  drop column if exists vendas_pedido_id, drop column if exists representative_id, drop column if exists asaas_payment_id,
  drop column if exists asaas_status, drop column if exists charge_url, drop column if exists bank_slip_url,
  drop column if exists pix_payload, drop column if exists charged_at;

-- 5. Funções do módulo
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'vendas\_%' loop
    execute 'drop function if exists ' || f || ' cascade';
  end loop;
end $$;

notify pgrst, 'reload schema';
