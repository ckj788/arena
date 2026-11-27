BEGIN;

-- One committed publication per account per New York calendar day across all entry points.
CREATE TABLE IF NOT EXISTS public.shipandbattle_last_publication (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  publication_day date NOT NULL
);
ALTER TABLE public.shipandbattle_last_publication ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipandbattle_last_publication FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.shipandbattle_claim_publication_day()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  today date := (statement_timestamp() AT TIME ZONE 'America/New_York')::date;
BEGIN
  INSERT INTO public.shipandbattle_last_publication AS quota (user_id, publication_day)
  VALUES (NEW.shipandbattle_creator_uid, today)
  ON CONFLICT (user_id) DO UPDATE SET publication_day = EXCLUDED.publication_day
    WHERE quota.publication_day < EXCLUDED.publication_day;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You can publish one new product per account per day. Please try again after midnight New York time.'
      USING ERRCODE = 'IC001';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.shipandbattle_claim_publication_day() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER shipandbattle_daily_publication
AFTER INSERT ON public.shipandbattle_products
FOR EACH ROW WHEN (NEW.shipandbattle_creator_uid IS NOT NULL)
EXECUTE FUNCTION public.shipandbattle_claim_publication_day();

-- The trigger installation locks out concurrent inserts until this backfill commits.
INSERT INTO public.shipandbattle_last_publication AS quota (user_id, publication_day)
SELECT DISTINCT shipandbattle_creator_uid, (shipandbattle_submitted_at AT TIME ZONE 'America/New_York')::date
FROM public.shipandbattle_products
WHERE shipandbattle_creator_uid IS NOT NULL
  AND (shipandbattle_submitted_at AT TIME ZONE 'America/New_York')::date
      = (statement_timestamp() AT TIME ZONE 'America/New_York')::date
ON CONFLICT (user_id) DO UPDATE SET publication_day = EXCLUDED.publication_day
  WHERE quota.publication_day < EXCLUDED.publication_day;

-- Align the existing free-submit request throttle with the publication quota.
CREATE OR REPLACE FUNCTION public.shipandbattle_consume_rate_limit(p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_window INTERVAL;
  v_limit INTEGER;
  v_window_start TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '28000';
  END IF;

  CASE p_action
    WHEN 'logo'           THEN v_window := INTERVAL '1 day';  v_limit := 10;
    WHEN 'product_submit' THEN v_window := INTERVAL '1 day';  v_limit := 3;
    WHEN 'product_update' THEN v_window := INTERVAL '1 hour'; v_limit := 20;
    WHEN 'queue'          THEN v_window := INTERVAL '1 hour'; v_limit := 10;
    WHEN 'settle'         THEN v_window := INTERVAL '1 hour'; v_limit := 30;
    WHEN 'vote'           THEN v_window := INTERVAL '1 hour'; v_limit := 60;
    ELSE
      RAISE EXCEPTION 'unsupported rate-limit action' USING ERRCODE = '22023';
  END CASE;

  IF p_action = 'product_submit' THEN
    v_window_start := date_trunc('day', statement_timestamp(), 'America/New_York');
  ELSE
    v_window_start := date_bin(v_window, clock_timestamp(), TIMESTAMPTZ '2001-01-01 00:00:00+00');
  END IF;

  INSERT INTO public.shipandbattle_rate_limits (
    shipandbattle_user_id,
    shipandbattle_action,
    shipandbattle_window_started_at,
    shipandbattle_request_count
  ) VALUES (v_user_id, p_action, v_window_start, 1)
  ON CONFLICT (
    shipandbattle_user_id,
    shipandbattle_action,
    shipandbattle_window_started_at
  ) DO UPDATE
    SET shipandbattle_request_count = public.shipandbattle_rate_limits.shipandbattle_request_count + 1
    WHERE public.shipandbattle_rate_limits.shipandbattle_request_count < v_limit
  RETURNING shipandbattle_request_count INTO v_count;

  IF v_count IS NULL THEN
    RAISE EXCEPTION 'rate limit exceeded' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.shipandbattle_rate_limits
  WHERE shipandbattle_user_id = v_user_id
    AND shipandbattle_window_started_at < clock_timestamp() - INTERVAL '2 days';
END;
$function$;
REVOKE ALL ON FUNCTION public.shipandbattle_consume_rate_limit(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipandbattle_consume_rate_limit(text) TO authenticated;

COMMIT;
