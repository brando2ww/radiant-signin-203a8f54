DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'pdv_products',
    'pdv_product_options',
    'pdv_product_option_items',
    'pdv_product_compositions',
    'pdv_product_composition_groups',
    'delivery_products',
    'delivery_categories',
    'delivery_product_options',
    'delivery_product_option_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END $$;