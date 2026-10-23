-- Fecha delivery_customers (vazamento de 23/10/2026).
--
-- As regras "Clientes podem ver/atualizar seus próprios dados" eram `true`
-- para todo mundo, inclusive sem login: qualquer pessoa com a chave pública
-- do app lia e alterava nome, telefone, e-mail, CPF e nascimento de todos os
-- clientes de todas as lojas.
--
-- Fica assim:
--  · o cliente logado lê e altera o próprio cadastro (regras que já existiam);
--  · dono e equipe leem e alteram os clientes ligados à loja deles
--    (delivery_clientes_loja: pediu, juntou pontos ou resgatou ali);
--  · o pedido sem cadastro passa por delivery_cliente_convidado (servidor).

drop policy if exists "Clientes podem ver seus próprios dados" on public.delivery_customers;
drop policy if exists "Clientes podem atualizar seus próprios dados" on public.delivery_customers;

drop policy if exists delivery_customers_equipe_select on public.delivery_customers;
create policy delivery_customers_equipe_select
  on public.delivery_customers for select to authenticated
  using (exists (
    select 1 from public.delivery_clientes_loja l
     where l.customer_id = delivery_customers.id
       and l.user_id = (select public.pdv_resolve_owner(auth.uid()))));

drop policy if exists delivery_customers_equipe_update on public.delivery_customers;
create policy delivery_customers_equipe_update
  on public.delivery_customers for update to authenticated
  using (exists (
    select 1 from public.delivery_clientes_loja l
     where l.customer_id = delivery_customers.id
       and l.user_id = (select public.pdv_resolve_owner(auth.uid()))))
  with check (exists (
    select 1 from public.delivery_clientes_loja l
     where l.customer_id = delivery_customers.id
       and l.user_id = (select public.pdv_resolve_owner(auth.uid()))));
