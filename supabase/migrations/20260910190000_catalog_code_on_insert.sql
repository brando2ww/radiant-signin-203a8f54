-- Produto novo nasce com código.
--
-- `gerar_codigos_catalogo` existia mas não era chamada por ninguém no app: os
-- códigos só apareciam quando alguém rodava a função à mão. Resultado, em
-- 10/09/2026: "Pastel de Guiosa" e "Temaki Shimeji", cadastrados às 17h45 e
-- 18h02, ficaram sem código nenhum e sumiram da tela de integração do iFood.
--
-- O código herda do NOME quando já existe um item igual (mesma regra da
-- migration 20260910140000): complemento repetido em vários produtos continua
-- com um número só.
CREATE OR REPLACE FUNCTION public.atribuir_codigo_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_kind text;
  v_nome text;
  v_code integer;
BEGIN
  IF TG_TABLE_NAME = 'delivery_products' THEN
    v_owner := NEW.user_id;
    v_kind := 'product';
  ELSE
    SELECT p.user_id INTO v_owner
      FROM public.delivery_product_options o
      JOIN public.delivery_products p ON p.id = o.product_id
     WHERE o.id = NEW.option_id;
    v_kind := 'option_item';
  END IF;

  v_nome := public.identidade_catalogo(NEW.name);
  IF v_owner IS NULL OR v_nome = '' THEN
    RETURN NEW;
  END IF;

  -- Serializa por tenant: dois cadastros simultâneos pegariam o mesmo número,
  -- e desde que o código passou a ser compartilhado por nome não há mais
  -- unicidade no banco para barrar isso.
  PERFORM pg_advisory_xact_lock(hashtext(v_owner::text));

  SELECT c.code INTO v_code
    FROM public.delivery_catalog_codes c
    LEFT JOIN public.delivery_products p2 ON p2.id = c.ref_id
    LEFT JOIN public.delivery_product_option_items i2 ON i2.id = c.ref_id
   WHERE c.user_id = v_owner
     AND c.kind = v_kind
     AND public.identidade_catalogo(COALESCE(p2.name, i2.name)) = v_nome
   LIMIT 1;

  IF v_code IS NULL THEN
    v_code := public.proximo_codigo_catalogo(v_owner);
  END IF;

  INSERT INTO public.delivery_catalog_codes (user_id, code, kind, ref_id)
  VALUES (v_owner, v_code, v_kind, NEW.id)
  ON CONFLICT (ref_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_codigo_catalogo_produto ON public.delivery_products;
CREATE TRIGGER trg_codigo_catalogo_produto
  AFTER INSERT ON public.delivery_products
  FOR EACH ROW EXECUTE FUNCTION public.atribuir_codigo_catalogo();

DROP TRIGGER IF EXISTS trg_codigo_catalogo_opcao ON public.delivery_product_option_items;
CREATE TRIGGER trg_codigo_catalogo_opcao
  AFTER INSERT ON public.delivery_product_option_items
  FOR EACH ROW EXECUTE FUNCTION public.atribuir_codigo_catalogo();

-- Item apagado não pode deixar código órfão: ele contaria no total da tela e o
-- progresso nunca fecharia.
CREATE OR REPLACE FUNCTION public.limpar_codigo_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.delivery_catalog_codes WHERE ref_id = OLD.id;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_codigo_catalogo_produto_del ON public.delivery_products;
CREATE TRIGGER trg_codigo_catalogo_produto_del
  AFTER DELETE ON public.delivery_products
  FOR EACH ROW EXECUTE FUNCTION public.limpar_codigo_catalogo();

DROP TRIGGER IF EXISTS trg_codigo_catalogo_opcao_del ON public.delivery_product_option_items;
CREATE TRIGGER trg_codigo_catalogo_opcao_del
  AFTER DELETE ON public.delivery_product_option_items
  FOR EACH ROW EXECUTE FUNCTION public.limpar_codigo_catalogo();
