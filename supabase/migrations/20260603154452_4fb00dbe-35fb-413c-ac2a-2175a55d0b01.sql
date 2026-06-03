
-- Helper: is current user a super admin?
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Aggregated dashboard stats for super admin (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats(p_start timestamptz, p_end timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_days int;
  v_prev_start timestamptz;
  v_prev_end timestamptz;
  v_result jsonb;
  v_total_tenants int;
  v_active_tenants int;
  v_total_users int;
  v_active_modules int;
  v_new_in_period int;
  v_new_prev int;
  v_franchises int;
  v_sales numeric;
  v_delivery_orders int;
  v_evaluations int;
  v_checklists int;
  v_coupons int;
  v_growth jsonb;
  v_top jsonb;
  v_alerts jsonb;
  v_modules jsonb;
  v_feed jsonb;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_period_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_end - p_start)) / 86400)::int);
  v_prev_end := p_start - interval '1 microsecond';
  v_prev_start := v_prev_end - (p_end - p_start);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active),
         COUNT(*) FILTER (WHERE parent_tenant_id IS NOT NULL),
         COUNT(*) FILTER (WHERE created_at BETWEEN p_start AND p_end),
         COUNT(*) FILTER (WHERE created_at BETWEEN v_prev_start AND v_prev_end)
  INTO v_total_tenants, v_active_tenants, v_franchises, v_new_in_period, v_new_prev
  FROM tenants;

  SELECT COUNT(*) INTO v_total_users FROM establishment_users;
  SELECT COUNT(*) INTO v_active_modules FROM tenant_modules WHERE is_active = true;

  SELECT COALESCE(SUM(pp.amount), 0) INTO v_sales
  FROM pdv_payments pp
  WHERE pp.created_at BETWEEN p_start AND p_end;

  SELECT COUNT(*) INTO v_delivery_orders FROM delivery_orders
  WHERE created_at BETWEEN p_start AND p_end AND status <> 'cancelled';

  SELECT COUNT(*) INTO v_evaluations FROM customer_evaluations
  WHERE created_at BETWEEN p_start AND p_end;

  SELECT COUNT(*) INTO v_checklists FROM checklist_executions
  WHERE created_at BETWEEN p_start AND p_end;

  SELECT COUNT(*) INTO v_coupons FROM campaign_prize_wins
  WHERE created_at BETWEEN p_start AND p_end;

  -- Growth: last 12 months
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now()) - interval '11 months',
      date_trunc('month', now()),
      interval '1 month'
    ) AS m
  ),
  per_month AS (
    SELECT
      to_char(m, 'YYYY-MM') AS month,
      (SELECT COUNT(*) FROM tenants t
        WHERE date_trunc('month', t.created_at) = m) AS novos,
      (SELECT COUNT(*) FROM tenants t
        WHERE date_trunc('month', t.updated_at) = m AND t.is_active = false) AS cancelados,
      (SELECT COUNT(*) FROM tenants t
        WHERE t.created_at <= (m + interval '1 month' - interval '1 day') AND t.is_active = true) AS ativos
    FROM months
  )
  SELECT jsonb_agg(to_jsonb(per_month) ORDER BY month) INTO v_growth FROM per_month;

  -- Top 10 tenants by sales in period
  WITH owner_sales AS (
    SELECT po.user_id, COALESCE(SUM(pp.amount), 0) AS volume,
           COUNT(DISTINCT po.id) AS pdv_orders
    FROM pdv_payments pp
    JOIN pdv_orders po ON po.id = pp.order_id
    WHERE pp.created_at BETWEEN p_start AND p_end
    GROUP BY po.user_id
  ),
  owner_delivery AS (
    SELECT user_id, COUNT(*) AS qty FROM delivery_orders
    WHERE created_at BETWEEN p_start AND p_end AND status <> 'cancelled'
    GROUP BY user_id
  ),
  owner_evals AS (
    SELECT user_id, COUNT(*) AS qty FROM customer_evaluations
    WHERE created_at BETWEEN p_start AND p_end
    GROUP BY user_id
  )
  SELECT jsonb_agg(row_to_json(x)) INTO v_top FROM (
    SELECT t.id, t.name, t.is_active,
           COALESCE(os.volume, 0) AS volume,
           COALESCE(od.qty, 0) AS delivery_orders,
           COALESCE(oe.qty, 0) AS evaluations
    FROM tenants t
    LEFT JOIN owner_sales os ON os.user_id = t.owner_user_id
    LEFT JOIN owner_delivery od ON od.user_id = t.owner_user_id
    LEFT JOIN owner_evals oe ON oe.user_id = t.owner_user_id
    WHERE COALESCE(os.volume, 0) + COALESCE(od.qty, 0) + COALESCE(oe.qty, 0) > 0
    ORDER BY COALESCE(os.volume, 0) DESC
    LIMIT 10
  ) x;

  -- Alerts
  WITH inativos AS (
    SELECT id, name, updated_at FROM tenants WHERE is_active = false
    ORDER BY updated_at DESC LIMIT 20
  ),
  sem_modulos AS (
    SELECT t.id, t.name FROM tenants t
    WHERE NOT EXISTS (SELECT 1 FROM tenant_modules tm WHERE tm.tenant_id = t.id AND tm.is_active = true)
    LIMIT 20
  ),
  sem_users AS (
    SELECT t.id, t.name FROM tenants t
    WHERE (SELECT COUNT(*) FROM establishment_users eu WHERE eu.tenant_id = t.id) <= 1
    LIMIT 20
  )
  SELECT jsonb_build_object(
    'inativos', COALESCE((SELECT jsonb_agg(row_to_json(i)) FROM inativos i), '[]'::jsonb),
    'sem_modulos', COALESCE((SELECT jsonb_agg(row_to_json(s)) FROM sem_modulos s), '[]'::jsonb),
    'sem_users', COALESCE((SELECT jsonb_agg(row_to_json(s)) FROM sem_users s), '[]'::jsonb)
  ) INTO v_alerts;

  -- Modules health
  WITH all_tenants_count AS (SELECT COUNT(*)::int AS c FROM tenants),
  modules_active AS (
    SELECT module::text AS module, COUNT(DISTINCT tenant_id)::int AS tenants
    FROM tenant_modules WHERE is_active = true GROUP BY module
  )
  SELECT jsonb_build_object(
    'total_tenants', (SELECT c FROM all_tenants_count),
    'modules', COALESCE((SELECT jsonb_agg(jsonb_build_object('module', module, 'tenants', tenants)) FROM modules_active), '[]'::jsonb),
    'volumes', jsonb_build_object(
      'pdv_sales', v_sales,
      'delivery_orders', v_delivery_orders,
      'evaluations', v_evaluations,
      'checklists', v_checklists
    )
  ) INTO v_modules;

  -- Feed: last 20 events
  WITH evs AS (
    SELECT 'tenant_created' AS kind, t.created_at AS at, t.id::text AS ref, t.name AS tenant_name, NULL::text AS detail
    FROM tenants t
    UNION ALL
    SELECT 'module_toggle', tm.created_at, tm.tenant_id::text, t.name, tm.module::text
    FROM tenant_modules tm JOIN tenants t ON t.id = tm.tenant_id
    UNION ALL
    SELECT 'integration_added', ti.created_at, ti.tenant_id::text, t.name, ti.integration_slug
    FROM tenant_integrations ti JOIN tenants t ON t.id = ti.tenant_id
  )
  SELECT jsonb_agg(row_to_json(e) ORDER BY at DESC) INTO v_feed
  FROM (SELECT * FROM evs ORDER BY at DESC LIMIT 20) e;

  v_result := jsonb_build_object(
    'metrics', jsonb_build_object(
      'total_tenants', v_total_tenants,
      'active_tenants', v_active_tenants,
      'total_users', v_total_users,
      'active_modules', v_active_modules,
      'new_in_period', v_new_in_period,
      'new_in_previous', v_new_prev,
      'franchises', v_franchises
    ),
    'activity', jsonb_build_object(
      'sales', v_sales,
      'delivery_orders', v_delivery_orders,
      'evaluations', v_evaluations,
      'checklists', v_checklists,
      'coupons', v_coupons
    ),
    'growth', COALESCE(v_growth, '[]'::jsonb),
    'top_tenants', COALESCE(v_top, '[]'::jsonb),
    'alerts', v_alerts,
    'modules_health', v_modules,
    'feed', COALESCE(v_feed, '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats(timestamptz, timestamptz) TO authenticated;
