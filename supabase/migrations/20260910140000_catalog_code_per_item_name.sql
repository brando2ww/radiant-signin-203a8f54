-- Mesmo item, mesmo código.
--
-- A numeração era por LINHA do cardápio, e o mesmo complemento está cadastrado
-- uma vez por produto: "Wassabi" aparece 11 vezes no Kōten Garibaldi, e recebia
-- 11 códigos. Isso derruba o propósito do código, que é dar identidade única ao
-- item para o pedido do iFood chegar sabendo o que é.
--
-- A identidade não pode ser `source_pdv_option_item_id`: o próprio catálogo do
-- PDV duplica na mesma proporção (11 cadastros de "Wassabi" = 11 origens
-- distintas). Sobra o NOME, normalizado — que é como o lojista pensa no item.

CREATE OR REPLACE FUNCTION public.identidade_catalogo(_nome text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT lower(btrim(translate(
    coalesce(_nome, ''),
    'áàâãäéèêëíìîïóòôõöúùûüñçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÑÇ',
    'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
  )));
$function$;

-- Vários refs passam a dividir o mesmo código, então a unicidade sai.
ALTER TABLE public.delivery_catalog_codes DROP CONSTRAINT IF EXISTS uq_catalog_code_por_tenant;

-- Um código por (tenant, tipo, nome). Reaproveita o MENOR já existente do grupo.
WITH ident AS (
  SELECT c.id, c.user_id, c.kind,
         public.identidade_catalogo(COALESCE(p.name, oi.name)) AS nome
  FROM public.delivery_catalog_codes c
  LEFT JOIN public.delivery_products p ON p.id = c.ref_id
  LEFT JOIN public.delivery_product_option_items oi ON oi.id = c.ref_id
),
alvo AS (
  SELECT i.id,
         MIN(c2.code) OVER (PARTITION BY i.user_id, i.kind, i.nome) AS code_grupo
  FROM ident i
  JOIN public.delivery_catalog_codes c2 ON c2.id = i.id
  WHERE i.nome <> ''
)
UPDATE public.delivery_catalog_codes c
SET code = a.code_grupo
FROM alvo a
WHERE a.id = c.id AND c.code <> a.code_grupo;

-- Gerador: item novo herda o código do grupo quando o nome já existe.
CREATE OR REPLACE FUNCTION public.gerar_codigos_catalogo(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_next integer;
  v_criados integer := 0;
  v_code integer;
  r record;
BEGIN
  SELECT GREATEST(COALESCE(MAX(code), 0) + 1, 900001) INTO v_next
  FROM public.delivery_catalog_codes WHERE user_id = _user_id;

  -- Mapa identidade → código já atribuído neste tenant.
  CREATE TEMP TABLE IF NOT EXISTS tmp_ident_codigos (
    kind text, nome text, code integer
  ) ON COMMIT DROP;
  TRUNCATE tmp_ident_codigos;

  INSERT INTO tmp_ident_codigos (kind, nome, code)
  SELECT DISTINCT c.kind,
         public.identidade_catalogo(COALESCE(p.name, oi.name)),
         c.code
  FROM public.delivery_catalog_codes c
  LEFT JOIN public.delivery_products p ON p.id = c.ref_id
  LEFT JOIN public.delivery_product_option_items oi ON oi.id = c.ref_id
  WHERE c.user_id = _user_id;

  FOR r IN
    SELECT x.id, x.nome, x.kind FROM (
      SELECT p.id, public.identidade_catalogo(p.name) AS nome, 'product'::text AS kind,
             0 AS grupo, p.order_position AS pos, p.created_at AS criado
      FROM public.delivery_products p
      WHERE p.user_id = _user_id
        AND NOT EXISTS (SELECT 1 FROM public.delivery_catalog_codes c WHERE c.ref_id = p.id)

      UNION ALL

      SELECT oi.id, public.identidade_catalogo(oi.name), 'option_item'::text,
             1, oi.order_position, oi.created_at
      FROM public.delivery_product_option_items oi
      JOIN public.delivery_product_options o ON o.id = oi.option_id
      JOIN public.delivery_products p ON p.id = o.product_id
      WHERE p.user_id = _user_id
        AND NOT EXISTS (SELECT 1 FROM public.delivery_catalog_codes c WHERE c.ref_id = oi.id)
    ) x
    -- Produto primeiro, e dentro de cada grupo a ordem do cardápio: assim os
    -- números seguem a mesma sequência que o lojista vê na tela.
    ORDER BY x.grupo, x.pos NULLS LAST, x.criado
  LOOP
    SELECT t.code INTO v_code
    FROM tmp_ident_codigos t
    WHERE t.kind = r.kind AND t.nome = r.nome
    LIMIT 1;

    IF v_code IS NULL THEN
      v_code := v_next;
      v_next := v_next + 1;
      INSERT INTO tmp_ident_codigos (kind, nome, code) VALUES (r.kind, r.nome, v_code);
    END IF;

    INSERT INTO public.delivery_catalog_codes (user_id, code, kind, ref_id)
    VALUES (_user_id, v_code, r.kind, r.id);
    v_criados := v_criados + 1;
  END LOOP;

  RETURN v_criados;
END;
$function$;
