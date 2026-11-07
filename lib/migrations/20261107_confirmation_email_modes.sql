BEGIN;

-- Keep sandbox mail out of the live sender, even when both use one database.
DROP FUNCTION IF EXISTS public.shipandbattle_claim_confirmation_emails(uuid);
CREATE OR REPLACE FUNCTION public.shipandbattle_claim_confirmation_emails(p_order_id uuid, p_livemode boolean)
RETURNS SETOF public.shipandbattle_confirmation_emails
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH candidates AS (
    SELECT mail.id FROM public.shipandbattle_confirmation_emails AS mail
    JOIN public.shipandbattle_launch_orders AS orders ON orders.id = mail.order_id
    WHERE orders.livemode = p_livemode AND orders.status = 'paid'
      AND orders.details_submitted_at IS NOT NULL
      AND (p_order_id IS NULL OR mail.order_id = p_order_id)
      AND (mail.status = 'pending' OR (mail.status = 'sending' AND mail.locked_until < now()))
      AND mail.attempts < 5 AND mail.created_at > now() - interval '23 hours'
    ORDER BY mail.created_at LIMIT 5 FOR UPDATE OF mail SKIP LOCKED
  )
  UPDATE public.shipandbattle_confirmation_emails AS mail
    SET status = 'sending', claim_token = gen_random_uuid(),
      locked_until = now() + interval '2 minutes', attempts = attempts + 1
  FROM candidates WHERE mail.id = candidates.id RETURNING mail.*;
$$;
REVOKE ALL ON FUNCTION public.shipandbattle_claim_confirmation_emails(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_claim_confirmation_emails(uuid,boolean) TO service_role;

CREATE INDEX IF NOT EXISTS shipandbattle_launch_orders_owner_history
  ON public.shipandbattle_launch_orders (user_id, livemode, created_at DESC) WHERE status = 'paid';

COMMIT;
