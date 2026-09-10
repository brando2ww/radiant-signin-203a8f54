-- Código numérico do catálogo de delivery, para casar com o iFood.
--
-- O iFood entrega em cada item, complemento e customização um campo
-- `externalCode` — é ali que o lojista escreve o código do PDV dentro do
-- cardápio dele. É a ponte oficial da plataforma, e existe justamente para o
-- integrador não ter que adivinhar de qual produto se trata.
--
-- Até aqui o Velara não tinha código nenhum: delivery_products e
-- delivery_product_option_items só têm id (UUID) e nome. Comparar UUID a olho
-- contra a tela do iFood é receita para erro silencioso — o pedido entra, não
-- casa com nada, e ninguém percebe.
--
-- POR QUE UMA TABELA À PARTE, e não uma coluna em cada catálogo:
-- o `externalCode` que volta do iFood NÃO diz se é item ou complemento. Com
-- duas sequências independentes, o código 14 seria ambíguo. Um único balcão por
-- estabelecimento garante que cada número aponta para uma coisa só.

CREATE TABLE IF NOT EXISTS public.delivery_catalog_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code integer NOT NULL,
  -- 'product' = item do cardápio · 'option_item' = complemento/subitem
  kind text NOT NULL CHECK (kind IN ('product', 'option_item')),
  ref_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- o número é único dentro do estabelecimento; é o que o lojista digita no iFood
  CONSTRAINT uq_catalog_code_por_tenant UNIQUE (user_id, code),
  -- cada produto/subitem tem no máximo um código
  CONSTRAINT uq_catalog_code_ref UNIQUE (ref_id)
);

CREATE INDEX IF NOT EXISTS idx_catalog_codes_user ON public.delivery_catalog_codes (user_id, code);

ALTER TABLE public.delivery_catalog_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Estabelecimento lê seus códigos" ON public.delivery_catalog_codes;
CREATE POLICY "Estabelecimento lê seus códigos"
  ON public.delivery_catalog_codes FOR SELECT
  USING (public.can_access_owner(user_id));

COMMENT ON TABLE public.delivery_catalog_codes IS
  'Código numérico por estabelecimento para item e subitem do delivery. É o valor que o lojista informa como código externo no cardápio do iFood, e o que a ingestão usa para casar o pedido com o produto interno.';

-- Próximo número livre do estabelecimento. MAX+1 e não uma sequence porque a
-- numeração é por tenant e precisa começar em 1 para cada um.
CREATE OR REPLACE FUNCTION public.proximo_codigo_catalogo(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(MAX(code), 0) + 1
  FROM public.delivery_catalog_codes
  WHERE user_id = _user_id;
$$;

-- Atribui código a tudo que ainda não tem: produtos primeiro (números baixos,
-- que são os mais usados na conferência), depois os subitens.
CREATE OR REPLACE FUNCTION public.gerar_codigos_catalogo(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next integer;
  v_criados integer := 0;
  r record;
BEGIN
  SELECT COALESCE(MAX(code), 0) + 1 INTO v_next
  FROM public.delivery_catalog_codes WHERE user_id = _user_id;

  FOR r IN
    SELECT p.id
    FROM public.delivery_products p
    WHERE p.user_id = _user_id
      AND NOT EXISTS (SELECT 1 FROM public.delivery_catalog_codes c WHERE c.ref_id = p.id)
    ORDER BY p.order_position NULLS LAST, p.created_at
  LOOP
    INSERT INTO public.delivery_catalog_codes (user_id, code, kind, ref_id)
    VALUES (_user_id, v_next, 'product', r.id);
    v_next := v_next + 1;
    v_criados := v_criados + 1;
  END LOOP;

  FOR r IN
    SELECT oi.id
    FROM public.delivery_product_option_items oi
    JOIN public.delivery_product_options o ON o.id = oi.option_id
    JOIN public.delivery_products p ON p.id = o.product_id
    WHERE p.user_id = _user_id
      AND NOT EXISTS (SELECT 1 FROM public.delivery_catalog_codes c WHERE c.ref_id = oi.id)
    ORDER BY p.order_position NULLS LAST, o.order_position NULLS LAST, oi.order_position NULLS LAST
  LOOP
    INSERT INTO public.delivery_catalog_codes (user_id, code, kind, ref_id)
    VALUES (_user_id, v_next, 'option_item', r.id);
    v_next := v_next + 1;
    v_criados := v_criados + 1;
  END LOOP;

  RETURN v_criados;
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_codigos_catalogo(uuid) TO authenticated;
