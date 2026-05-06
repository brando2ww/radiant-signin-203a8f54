ALTER TABLE public.delivery_product_options
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.delivery_product_option_items
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_delivery_product_options_updated_at ON public.delivery_product_options;
CREATE TRIGGER trg_delivery_product_options_updated_at
BEFORE UPDATE ON public.delivery_product_options
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_delivery_product_option_items_updated_at ON public.delivery_product_option_items;
CREATE TRIGGER trg_delivery_product_option_items_updated_at
BEFORE UPDATE ON public.delivery_product_option_items
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();