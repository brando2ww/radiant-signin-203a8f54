-- Align delivery_* RLS with establishment members pattern (matches PDV)

-- delivery_products
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios produtos" ON public.delivery_products;
DROP POLICY IF EXISTS "Usuários podem criar seus próprios produtos" ON public.delivery_products;
DROP POLICY IF EXISTS "Usuários podem deletar seus próprios produtos" ON public.delivery_products;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios produtos" ON public.delivery_products;

CREATE POLICY "Members can view delivery products"
ON public.delivery_products FOR SELECT
USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Members can insert delivery products"
ON public.delivery_products FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Members can update delivery products"
ON public.delivery_products FOR UPDATE
USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Members can delete delivery products"
ON public.delivery_products FOR DELETE
USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

-- delivery_categories
DROP POLICY IF EXISTS "Usuários podem atualizar suas próprias categorias" ON public.delivery_categories;
DROP POLICY IF EXISTS "Usuários podem criar suas próprias categorias" ON public.delivery_categories;
DROP POLICY IF EXISTS "Usuários podem deletar suas próprias categorias" ON public.delivery_categories;
DROP POLICY IF EXISTS "Usuários podem ver suas próprias categorias" ON public.delivery_categories;

CREATE POLICY "Members can view delivery categories"
ON public.delivery_categories FOR SELECT
USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Members can insert delivery categories"
ON public.delivery_categories FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Members can update delivery categories"
ON public.delivery_categories FOR UPDATE
USING (auth.uid() = user_id OR public.is_establishment_member(user_id));

CREATE POLICY "Members can delete delivery categories"
ON public.delivery_categories FOR DELETE
USING (auth.uid() = user_id OR public.is_establishment_member(user_id));