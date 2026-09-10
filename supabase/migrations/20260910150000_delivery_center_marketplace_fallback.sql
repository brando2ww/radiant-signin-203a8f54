-- Praça de impressão: cai no padrão da integração quando o produto não resolve.
--
-- O item encontra sua praça pelo produto (delivery_products → pdv_products.
-- printer_station → centro). Pedido de marketplace só tem esse caminho quando o
-- produto do iFood está vinculado ao produto daqui — e enquanto os códigos do
-- cardápio não forem colados no iFood, a maioria chega sem vínculo.
--
-- Sem praça, `dispatchDeliveryPrintJobs` grava o job com "sem impressora
-- configurada" e nada sai. Foi o que aconteceu com os 5 primeiros pedidos do
-- Kōten Garibaldi (09 e 10/09/2026) enquanto o delivery próprio imprimia normal
-- (1266 jobs). A causa não era a integração: era item sem praça.
--
-- O padrão é o ÚLTIMO recurso, nunca o primeiro: item com produto vinculado
-- continua indo para a praça dele. Por isso a ingestão grava NULL e a decisão
-- fica aqui, num lugar só, valendo para iFood e DeliveryMuch.
CREATE OR REPLACE FUNCTION public.delivery_resolve_item_center()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_pdv_id uuid;
  v_slug text;
  v_center uuid;
  v_source text;
BEGIN
  IF NEW.production_center_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.user_id, COALESCE(o.source, 'own')
    INTO v_owner, v_source
    FROM public.delivery_orders o WHERE o.id = NEW.order_id;
  IF v_owner IS NULL THEN RETURN NEW; END IF;

  -- 1. Praça do próprio produto.
  SELECT dp.source_pdv_product_id INTO v_pdv_id
    FROM public.delivery_products dp WHERE dp.id = NEW.product_id;

  IF v_pdv_id IS NOT NULL THEN
    SELECT p.printer_station INTO v_slug
      FROM public.pdv_products p WHERE p.id = v_pdv_id;

    IF v_slug IS NOT NULL AND v_slug <> '' THEN
      SELECT pc.id INTO v_center
        FROM public.pdv_production_centers pc
       WHERE pc.user_id = v_owner
         AND pc.is_active = true
         AND pc.slug = v_slug
       LIMIT 1;
    END IF;
  END IF;

  -- 2. Padrão da integração, só se nada foi encontrado.
  IF v_center IS NULL AND v_source <> 'own' THEN
    SELECT CASE v_source
             WHEN 'ifood' THEN s.ifood_default_production_center_id
             WHEN 'deliverymuch' THEN s.deliverymuch_default_production_center_id
             ELSE NULL
           END
      INTO v_center
      FROM public.pdv_settings s
     WHERE s.user_id = v_owner;

    -- Centro apagado ou desativado não vale como padrão.
    IF v_center IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.pdv_production_centers pc
       WHERE pc.id = v_center AND pc.user_id = v_owner AND pc.is_active = true
    ) THEN
      v_center := NULL;
    END IF;
  END IF;

  NEW.production_center_id := v_center;
  RETURN NEW;
END;
$function$;
