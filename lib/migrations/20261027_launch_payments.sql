-- Additive payment storage. Apply manually before enabling Stripe Checkout.
-- This migration uses the default shipandbattle_ prefix. It does not modify products.
BEGIN;

CREATE TABLE IF NOT EXISTS public.shipandbattle_launch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  request_id uuid NOT NULL,
  input_hash text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('starter','growth','pro')),
  amount_total integer NOT NULL CHECK (amount_total > 0),
  currency text NOT NULL CHECK (currency = 'usd'),
  livemode boolean NOT NULL,
  product jsonb,
  service_details jsonb,
  details_submitted_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','failed')),
  stripe_session_id text UNIQUE,
  stripe_payment_intent_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  UNIQUE (user_id,request_id)
);
CREATE TABLE IF NOT EXISTS public.shipandbattle_launch_payment_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.shipandbattle_launch_orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shipandbattle_launch_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipandbattle_launch_payment_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.shipandbattle_launch_orders, public.shipandbattle_launch_payment_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.shipandbattle_launch_orders, public.shipandbattle_launch_payment_events TO service_role;

CREATE OR REPLACE FUNCTION public.shipandbattle_apply_launch_checkout_event(
  p_event_id text, p_event_type text, p_order_id uuid, p_user_id uuid,
  p_session_id text, p_plan text, p_amount integer, p_currency text,
  p_livemode boolean, p_status text, p_payment_intent text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE o public.shipandbattle_launch_orders%ROWTYPE;
BEGIN
  SELECT * INTO o FROM public.shipandbattle_launch_orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found'; END IF;
  IF o.user_id IS DISTINCT FROM p_user_id OR o.plan IS DISTINCT FROM p_plan
    OR o.amount_total IS DISTINCT FROM p_amount OR o.currency IS DISTINCT FROM p_currency
    OR o.livemode IS DISTINCT FROM p_livemode
    OR (o.stripe_session_id IS NOT NULL AND o.stripe_session_id IS DISTINCT FROM p_session_id)
    OR p_status IS NULL OR p_status NOT IN ('pending','paid','expired','failed')
    OR p_event_type NOT IN ('checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired')
  THEN RAISE EXCEPTION 'Payment event does not match order'; END IF;
  INSERT INTO public.shipandbattle_launch_payment_events(id,event_type,order_id)
    VALUES (p_event_id,p_event_type,p_order_id) ON CONFLICT (id) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.shipandbattle_launch_orders SET
    stripe_session_id=p_session_id,
    stripe_payment_intent_id=coalesce(p_payment_intent,stripe_payment_intent_id),
    status=CASE WHEN status='paid' OR p_status='paid' THEN 'paid'
      WHEN status IN ('expired','failed') AND p_status='pending' THEN status ELSE p_status END,
    paid_at=CASE WHEN p_status='paid' THEN coalesce(paid_at,now()) ELSE paid_at END
  WHERE id=p_order_id;
END;
$$;
REVOKE ALL ON FUNCTION public.shipandbattle_apply_launch_checkout_event(text,text,uuid,uuid,text,text,integer,text,boolean,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_apply_launch_checkout_event(text,text,uuid,uuid,text,text,integer,text,boolean,text,text) TO service_role;
COMMIT;
