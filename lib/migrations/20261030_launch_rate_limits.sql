-- Run after the two launch payment migrations. Does not change product quotas,
-- products, orders, payment status, or the existing consume_rate_limit function.
BEGIN;

ALTER TABLE public.shipandbattle_rate_limits
  DROP CONSTRAINT shipandbattle_rate_limits_shipandbattle_action_check;
ALTER TABLE public.shipandbattle_rate_limits
  ADD CONSTRAINT shipandbattle_rate_limits_shipandbattle_action_check
  CHECK (shipandbattle_action IN (
    'logo', 'product_submit', 'product_update', 'queue', 'settle', 'vote',
    'checkout', 'launch_details'
  ));

CREATE OR REPLACE FUNCTION public.shipandbattle_consume_launch_rate_limit(p_action text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_window_start timestamptz := date_trunc('hour', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;
  IF p_action IS NULL OR p_action NOT IN ('checkout', 'launch_details') THEN
    RAISE EXCEPTION 'unsupported launch action' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.shipandbattle_rate_limits (
    shipandbattle_user_id, shipandbattle_action,
    shipandbattle_window_started_at, shipandbattle_request_count
  ) VALUES (v_user_id, p_action, v_window_start, 1)
  ON CONFLICT (shipandbattle_user_id, shipandbattle_action, shipandbattle_window_started_at)
  DO UPDATE SET shipandbattle_request_count = public.shipandbattle_rate_limits.shipandbattle_request_count + 1
    WHERE public.shipandbattle_rate_limits.shipandbattle_request_count < 20
  RETURNING shipandbattle_request_count INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'launch rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.shipandbattle_rate_limits
  WHERE shipandbattle_user_id = v_user_id
    AND shipandbattle_window_started_at < clock_timestamp() - INTERVAL '2 days';
END;
$$;
ALTER FUNCTION public.shipandbattle_consume_launch_rate_limit(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.shipandbattle_consume_launch_rate_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_consume_launch_rate_limit(text) TO authenticated;
COMMIT;
