-- Regras de acesso de pedidos, itens, adicionais e endereços do delivery.
-- Aplicar DEPOIS da tela que usa delivery_pedido_criar / _acompanhar /
-- delivery_enderecos_* (20261023220000): sem ela, o cardápio online quebra.

-- Equipe = dono ou funcionário da loja do pedido.
-- (select ...) para o Postgres calcular uma vez, não a cada linha.

-- ── delivery_orders
drop policy if exists "Clientes podem ver seus próprios pedidos" on public.delivery_orders;
drop policy if exists "Customer can confirm delivery received" on public.delivery_orders;
drop policy if exists "Qualquer pessoa pode criar pedidos" on public.delivery_orders;

drop policy if exists delivery_orders_equipe_select on public.delivery_orders;
create policy delivery_orders_equipe_select on public.delivery_orders
  for select to authenticated
  using (user_id = (select public.pdv_resolve_owner(auth.uid())));

drop policy if exists delivery_orders_equipe_insert on public.delivery_orders;
create policy delivery_orders_equipe_insert on public.delivery_orders
  for insert to authenticated
  with check (user_id = (select public.pdv_resolve_owner(auth.uid())));

drop policy if exists delivery_orders_equipe_update on public.delivery_orders;
create policy delivery_orders_equipe_update on public.delivery_orders
  for update to authenticated
  using (user_id = (select public.pdv_resolve_owner(auth.uid())))
  with check (user_id = (select public.pdv_resolve_owner(auth.uid())));

-- ── delivery_order_items
drop policy if exists "Público pode ver itens de pedidos" on public.delivery_order_items;
drop policy if exists "Qualquer pessoa pode criar itens de pedido" on public.delivery_order_items;

drop policy if exists delivery_order_items_equipe on public.delivery_order_items;
create policy delivery_order_items_equipe on public.delivery_order_items
  for all to authenticated
  using (exists (select 1 from public.delivery_orders o
                  where o.id = delivery_order_items.order_id
                    and o.user_id = (select public.pdv_resolve_owner(auth.uid()))))
  with check (exists (select 1 from public.delivery_orders o
                       where o.id = delivery_order_items.order_id
                         and o.user_id = (select public.pdv_resolve_owner(auth.uid()))));

-- ── delivery_order_item_options
drop policy if exists "Acesso público a opções de itens" on public.delivery_order_item_options;

drop policy if exists delivery_order_item_options_equipe on public.delivery_order_item_options;
create policy delivery_order_item_options_equipe on public.delivery_order_item_options
  for all to authenticated
  using (exists (select 1 from public.delivery_order_items i
                   join public.delivery_orders o on o.id = i.order_id
                  where i.id = delivery_order_item_options.order_item_id
                    and o.user_id = (select public.pdv_resolve_owner(auth.uid()))))
  with check (exists (select 1 from public.delivery_order_items i
                        join public.delivery_orders o on o.id = i.order_id
                       where i.id = delivery_order_item_options.order_item_id
                         and o.user_id = (select public.pdv_resolve_owner(auth.uid()))));

-- ── delivery_addresses
drop policy if exists "Clientes podem ver seus endereços" on public.delivery_addresses;
drop policy if exists "Clientes podem criar seus endereços" on public.delivery_addresses;
drop policy if exists "Clientes podem atualizar seus endereços" on public.delivery_addresses;
drop policy if exists "Clientes podem deletar seus endereços" on public.delivery_addresses;

-- O cliente logado cuida dos próprios endereços.
drop policy if exists delivery_addresses_cliente on public.delivery_addresses;
create policy delivery_addresses_cliente on public.delivery_addresses
  for all to authenticated
  using (customer_id in (select c.id from public.delivery_customers c where c.auth_user_id = auth.uid()))
  with check (customer_id in (select c.id from public.delivery_customers c where c.auth_user_id = auth.uid()));

-- A equipe vê os endereços dos clientes da loja.
drop policy if exists delivery_addresses_equipe_select on public.delivery_addresses;
create policy delivery_addresses_equipe_select on public.delivery_addresses
  for select to authenticated
  using (exists (select 1 from public.delivery_clientes_loja l
                  where l.customer_id = delivery_addresses.customer_id
                    and l.user_id = (select public.pdv_resolve_owner(auth.uid()))));
