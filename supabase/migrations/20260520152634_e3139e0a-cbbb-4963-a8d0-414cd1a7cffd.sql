CREATE OR REPLACE FUNCTION public.sync_coupon_usage_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_counts boolean;
  v_new_counts boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.coupon_code IS NOT NULL AND COALESCE(NEW.status, '') <> 'cancelled' THEN
      UPDATE public.delivery_coupons
         SET usage_count = usage_count + 1
       WHERE user_id = NEW.user_id AND code = NEW.coupon_code;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.coupon_code IS NOT NULL AND COALESCE(OLD.status, '') <> 'cancelled' THEN
      UPDATE public.delivery_coupons
         SET usage_count = GREATEST(usage_count - 1, 0)
       WHERE user_id = OLD.user_id AND code = OLD.coupon_code;
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_counts := OLD.coupon_code IS NOT NULL AND COALESCE(OLD.status, '') <> 'cancelled';
    v_new_counts := NEW.coupon_code IS NOT NULL AND COALESCE(NEW.status, '') <> 'cancelled';

    IF v_old_counts AND (NOT v_new_counts
       OR OLD.coupon_code IS DISTINCT FROM NEW.coupon_code
       OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
      UPDATE public.delivery_coupons
         SET usage_count = GREATEST(usage_count - 1, 0)
       WHERE user_id = OLD.user_id AND code = OLD.coupon_code;
    END IF;

    IF v_new_counts AND (NOT v_old_counts
       OR OLD.coupon_code IS DISTINCT FROM NEW.coupon_code
       OR OLD.user_id IS DISTINCT FROM NEW.user_id) THEN
      UPDATE public.delivery_coupons
         SET usage_count = usage_count + 1
       WHERE user_id = NEW.user_id AND code = NEW.coupon_code;
    END IF;

    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_coupon_usage_count ON public.delivery_orders;
CREATE TRIGGER trg_sync_coupon_usage_count
AFTER INSERT OR UPDATE OR DELETE ON public.delivery_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_coupon_usage_count();

-- Backfill
UPDATE public.delivery_coupons c
SET usage_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT user_id, coupon_code, COUNT(*)::int AS cnt
  FROM public.delivery_orders
  WHERE coupon_code IS NOT NULL AND COALESCE(status, '') <> 'cancelled'
  GROUP BY user_id, coupon_code
) sub
WHERE c.user_id = sub.user_id AND c.code = sub.coupon_code;