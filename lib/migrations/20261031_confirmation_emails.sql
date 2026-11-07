-- Run manually after launch payments. No historical emails are backfilled.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shipandbattle_confirmation_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.shipandbattle_launch_orders(id),
  recipient text NOT NULL,
  product_name text NOT NULL,
  plan text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent')),
  attempts integer NOT NULL DEFAULT 0,
  claim_token uuid,
  locked_until timestamptz,
  resend_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shipandbattle_confirmation_emails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipandbattle_confirmation_emails FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shipandbattle_confirmation_emails TO service_role;

CREATE OR REPLACE FUNCTION public.shipandbattle_queue_confirmation_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO public.shipandbattle_confirmation_emails(order_id,recipient,product_name,plan)
  VALUES (NEW.id,NEW.service_details->>'email',NEW.product->>'title',NEW.plan)
  ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.shipandbattle_queue_confirmation_email() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS shipandbattle_queue_confirmation ON public.shipandbattle_launch_orders;
CREATE TRIGGER shipandbattle_queue_confirmation AFTER UPDATE ON public.shipandbattle_launch_orders
FOR EACH ROW WHEN (OLD.details_submitted_at IS NULL AND NEW.details_submitted_at IS NOT NULL AND NEW.status='paid')
EXECUTE FUNCTION public.shipandbattle_queue_confirmation_email();

CREATE OR REPLACE FUNCTION public.shipandbattle_claim_confirmation_emails(p_order_id uuid DEFAULT NULL)
RETURNS SETOF public.shipandbattle_confirmation_emails
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH candidates AS (
    SELECT id FROM public.shipandbattle_confirmation_emails
    WHERE (p_order_id IS NULL OR order_id=p_order_id)
      AND (status='pending' OR (status='sending' AND locked_until < now()))
      AND attempts < 5 AND created_at > now()-interval '23 hours'
    ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.shipandbattle_confirmation_emails AS mail
    SET status='sending',claim_token=gen_random_uuid(),locked_until=now()+interval '2 minutes',attempts=attempts+1
  FROM candidates WHERE mail.id=candidates.id RETURNING mail.*;
$$;
REVOKE ALL ON FUNCTION public.shipandbattle_claim_confirmation_emails(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_claim_confirmation_emails(uuid) TO service_role;
COMMIT;
