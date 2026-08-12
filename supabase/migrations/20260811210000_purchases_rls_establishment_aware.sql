-- Compras e cotações: RLS por ESTABELECIMENTO, não por usuário logado.
--
-- Todas as policies destas 14 tabelas comparavam `auth.uid() = user_id`, ou seja,
-- com o usuário logado. Funcionário do estabelecimento (establishment_users com
-- establishment_owner_id = dono) tem auth.uid() diferente do dono e por isso
-- recebia ZERO linhas — sem erro, só telas vazias. O módulo inteiro (Cotações,
-- Pedidos, Fornecedores) era invisível para gerente/estoquista.
--
-- Esta migration aplica o mesmo padrão que 52 outras tabelas do banco já usam:
--   (auth.uid() = user_id) OR public.is_establishment_member(user_id)
-- onde is_establishment_member é STABLE SECURITY DEFINER e confere
-- establishment_users com is_active = true.
--
-- O isolamento ENTRE estabelecimentos não muda: is_establishment_member só casa
-- quem pertence ao mesmo dono. Quem vê qual tela continua sendo decidido pelo
-- papel (ROLE_SCOPE em src/hooks/use-user-role.ts), não pelo RLS.
--
-- Nome, comando e roles de cada policy são preservados.

-- ---------------------------------------------------------------- pdv_suppliers
drop policy if exists "Gestão de fornecedores" on public.pdv_suppliers;
create policy "Gestão de fornecedores" on public.pdv_suppliers
  for all to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id))
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

-- --------------------------------------------------------------- pdv_ingredients
-- Atenção: esta tabela é do módulo de ESTOQUE, não só de compras. Alinhar aqui
-- também libera o insumo para o funcionário — coerente com o papel `estoquista`.
drop policy if exists "Gestão de insumos" on public.pdv_ingredients;
create policy "Gestão de insumos" on public.pdv_ingredients
  for all to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id))
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

-- ---------------------------------------------------- pdv_ingredient_suppliers
drop policy if exists "Users can view their own ingredient suppliers" on public.pdv_ingredient_suppliers;
create policy "Users can view their own ingredient suppliers" on public.pdv_ingredient_suppliers
  for select to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can create their own ingredient suppliers" on public.pdv_ingredient_suppliers;
create policy "Users can create their own ingredient suppliers" on public.pdv_ingredient_suppliers
  for insert to public
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can update their own ingredient suppliers" on public.pdv_ingredient_suppliers;
create policy "Users can update their own ingredient suppliers" on public.pdv_ingredient_suppliers
  for update to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can delete their own ingredient suppliers" on public.pdv_ingredient_suppliers;
create policy "Users can delete their own ingredient suppliers" on public.pdv_ingredient_suppliers
  for delete to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

-- -------------------------------------------------------- pdv_stock_movements
-- Sem WITH CHECK no original: em policy FOR ALL o Postgres reusa o USING.
drop policy if exists "Gestão de movimentos de estoque" on public.pdv_stock_movements;
create policy "Gestão de movimentos de estoque" on public.pdv_stock_movements
  for all to public
  using (
    exists (
      select 1 from public.pdv_ingredients i
      where i.id = pdv_stock_movements.ingredient_id
        and (i.user_id = auth.uid() or public.is_establishment_member(i.user_id))
    )
  );

-- -------------------------------------------------------- pdv_purchase_orders
drop policy if exists "Users can view their own purchase orders" on public.pdv_purchase_orders;
create policy "Users can view their own purchase orders" on public.pdv_purchase_orders
  for select to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can create their own purchase orders" on public.pdv_purchase_orders;
create policy "Users can create their own purchase orders" on public.pdv_purchase_orders
  for insert to public
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can update their own purchase orders" on public.pdv_purchase_orders;
create policy "Users can update their own purchase orders" on public.pdv_purchase_orders
  for update to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can delete their own purchase orders" on public.pdv_purchase_orders;
create policy "Users can delete their own purchase orders" on public.pdv_purchase_orders
  for delete to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

-- --------------------------------------------------- pdv_purchase_order_items
drop policy if exists "Users can view purchase order items of their orders" on public.pdv_purchase_order_items;
create policy "Users can view purchase order items of their orders" on public.pdv_purchase_order_items
  for select to public
  using (
    exists (
      select 1 from public.pdv_purchase_orders po
      where po.id = pdv_purchase_order_items.purchase_order_id
        and (po.user_id = auth.uid() or public.is_establishment_member(po.user_id))
    )
  );

drop policy if exists "Users can create purchase order items for their orders" on public.pdv_purchase_order_items;
create policy "Users can create purchase order items for their orders" on public.pdv_purchase_order_items
  for insert to public
  with check (
    exists (
      select 1 from public.pdv_purchase_orders po
      where po.id = pdv_purchase_order_items.purchase_order_id
        and (po.user_id = auth.uid() or public.is_establishment_member(po.user_id))
    )
  );

drop policy if exists "Users can update purchase order items of their orders" on public.pdv_purchase_order_items;
create policy "Users can update purchase order items of their orders" on public.pdv_purchase_order_items
  for update to public
  using (
    exists (
      select 1 from public.pdv_purchase_orders po
      where po.id = pdv_purchase_order_items.purchase_order_id
        and (po.user_id = auth.uid() or public.is_establishment_member(po.user_id))
    )
  );

drop policy if exists "Users can delete purchase order items of their orders" on public.pdv_purchase_order_items;
create policy "Users can delete purchase order items of their orders" on public.pdv_purchase_order_items
  for delete to public
  using (
    exists (
      select 1 from public.pdv_purchase_orders po
      where po.id = pdv_purchase_order_items.purchase_order_id
        and (po.user_id = auth.uid() or public.is_establishment_member(po.user_id))
    )
  );

-- ------------------------------------------------------ pdv_quotation_requests
drop policy if exists "Users can view their own quotation requests" on public.pdv_quotation_requests;
create policy "Users can view their own quotation requests" on public.pdv_quotation_requests
  for select to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can create their own quotation requests" on public.pdv_quotation_requests;
create policy "Users can create their own quotation requests" on public.pdv_quotation_requests
  for insert to public
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can update their own quotation requests" on public.pdv_quotation_requests;
create policy "Users can update their own quotation requests" on public.pdv_quotation_requests
  for update to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Users can delete their own quotation requests" on public.pdv_quotation_requests;
create policy "Users can delete their own quotation requests" on public.pdv_quotation_requests
  for delete to public
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

-- --------------------------------------------------------- pdv_quotation_items
drop policy if exists "Users can view quotation items of their requests" on public.pdv_quotation_items;
create policy "Users can view quotation items of their requests" on public.pdv_quotation_items
  for select to public
  using (
    exists (
      select 1 from public.pdv_quotation_requests qr
      where qr.id = pdv_quotation_items.quotation_request_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

drop policy if exists "Users can create quotation items for their requests" on public.pdv_quotation_items;
create policy "Users can create quotation items for their requests" on public.pdv_quotation_items
  for insert to public
  with check (
    exists (
      select 1 from public.pdv_quotation_requests qr
      where qr.id = pdv_quotation_items.quotation_request_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

drop policy if exists "Users can update quotation items of their requests" on public.pdv_quotation_items;
create policy "Users can update quotation items of their requests" on public.pdv_quotation_items
  for update to public
  using (
    exists (
      select 1 from public.pdv_quotation_requests qr
      where qr.id = pdv_quotation_items.quotation_request_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

drop policy if exists "Users can delete quotation items of their requests" on public.pdv_quotation_items;
create policy "Users can delete quotation items of their requests" on public.pdv_quotation_items
  for delete to public
  using (
    exists (
      select 1 from public.pdv_quotation_requests qr
      where qr.id = pdv_quotation_items.quotation_request_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

-- ----------------------------------------------------- pdv_quotation_responses
drop policy if exists "Users can view quotation responses of their requests" on public.pdv_quotation_responses;
create policy "Users can view quotation responses of their requests" on public.pdv_quotation_responses
  for select to public
  using (
    exists (
      select 1 from public.pdv_quotation_items qi
      join public.pdv_quotation_requests qr on qr.id = qi.quotation_request_id
      where qi.id = pdv_quotation_responses.quotation_item_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

drop policy if exists "Users can create quotation responses for their requests" on public.pdv_quotation_responses;
create policy "Users can create quotation responses for their requests" on public.pdv_quotation_responses
  for insert to public
  with check (
    exists (
      select 1 from public.pdv_quotation_items qi
      join public.pdv_quotation_requests qr on qr.id = qi.quotation_request_id
      where qi.id = pdv_quotation_responses.quotation_item_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

drop policy if exists "Users can update quotation responses of their requests" on public.pdv_quotation_responses;
create policy "Users can update quotation responses of their requests" on public.pdv_quotation_responses
  for update to public
  using (
    exists (
      select 1 from public.pdv_quotation_items qi
      join public.pdv_quotation_requests qr on qr.id = qi.quotation_request_id
      where qi.id = pdv_quotation_responses.quotation_item_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

drop policy if exists "Users can delete quotation responses of their requests" on public.pdv_quotation_responses;
create policy "Users can delete quotation responses of their requests" on public.pdv_quotation_responses
  for delete to public
  using (
    exists (
      select 1 from public.pdv_quotation_items qi
      join public.pdv_quotation_requests qr on qr.id = qi.quotation_request_id
      where qi.id = pdv_quotation_responses.quotation_item_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

-- ------------------------------------------------ pdv_quotation_item_suppliers
drop policy if exists "Usuários podem gerenciar fornecedores de suas cotações" on public.pdv_quotation_item_suppliers;
create policy "Usuários podem gerenciar fornecedores de suas cotações" on public.pdv_quotation_item_suppliers
  for all to public
  using (
    exists (
      select 1 from public.pdv_quotation_items qi
      join public.pdv_quotation_requests qr on qr.id = qi.quotation_request_id
      where qi.id = pdv_quotation_item_suppliers.quotation_item_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  )
  with check (
    exists (
      select 1 from public.pdv_quotation_items qi
      join public.pdv_quotation_requests qr on qr.id = qi.quotation_request_id
      where qi.id = pdv_quotation_item_suppliers.quotation_item_id
        and (qr.user_id = auth.uid() or public.is_establishment_member(qr.user_id))
    )
  );

-- ------------------------------------------------ pdv_quotation_supplier_links
drop policy if exists owner_all_qsl on public.pdv_quotation_supplier_links;
create policy owner_all_qsl on public.pdv_quotation_supplier_links
  for all to authenticated
  using (auth.uid() = user_id or public.is_establishment_member(user_id))
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

-- ------------------------------------------------------------ pdv_receipt_links
drop policy if exists owner_all_prl on public.pdv_receipt_links;
create policy owner_all_prl on public.pdv_receipt_links
  for all to public
  using (user_id = auth.uid() or public.is_establishment_member(user_id))
  with check (user_id = auth.uid() or public.is_establishment_member(user_id));

-- ----------------------------------------------------------- pdv_receipt_events
drop policy if exists owner_read_pre on public.pdv_receipt_events;
create policy owner_read_pre on public.pdv_receipt_events
  for select to public
  using (user_id = auth.uid() or public.is_establishment_member(user_id));

-- --------------------------------------------------------- pdv_purchase_settings
drop policy if exists "Owner manages purchase settings" on public.pdv_purchase_settings;
create policy "Owner manages purchase settings" on public.pdv_purchase_settings
  for all to authenticated
  using (auth.uid() = user_id or public.is_establishment_member(user_id))
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));
