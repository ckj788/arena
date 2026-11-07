BEGIN;

-- Keep the private payment event ledger even when an administrator deletes an order.
ALTER TABLE public.shipandbattle_launch_payment_events
  DROP CONSTRAINT IF EXISTS shipandbattle_launch_payment_events_order_id_fkey;

ALTER TABLE public.shipandbattle_confirmation_emails
  DROP CONSTRAINT IF EXISTS shipandbattle_confirmation_emails_order_id_fkey,
  ADD CONSTRAINT shipandbattle_confirmation_emails_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.shipandbattle_launch_orders(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.shipandbattle_mark_launch_order_deleted()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  INSERT INTO public.shipandbattle_launch_payment_events (id, event_type, order_id)
    VALUES ('deleted:' || OLD.id, 'order.deleted', OLD.id)
    ON CONFLICT (id) DO NOTHING;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS shipandbattle_launch_order_deleted ON public.shipandbattle_launch_orders;
CREATE TRIGGER shipandbattle_launch_order_deleted
  BEFORE DELETE ON public.shipandbattle_launch_orders
  FOR EACH ROW EXECUTE FUNCTION public.shipandbattle_mark_launch_order_deleted();

CREATE OR REPLACE FUNCTION public.shipandbattle_record_launch_checkout_event(
  p_event_id text, p_event_type text, p_order_id uuid, p_user_id uuid,
  p_session_id text, p_plan text, p_amount integer, p_currency text,
  p_livemode boolean, p_status text, p_payment_intent text,
  p_request_id uuid, p_input_hash text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  deleted_id text := 'deleted:' || p_order_id;
  inserted boolean := false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.shipandbattle_launch_payment_events WHERE id = deleted_id) THEN RETURN; END IF;

  IF p_request_id IS NOT NULL THEN
    IF p_status IS DISTINCT FROM 'paid' THEN RETURN; END IF;
    INSERT INTO public.shipandbattle_launch_orders (
      id, user_id, request_id, input_hash, plan, amount_total, currency, livemode,
      status, stripe_session_id, paid_at
    ) VALUES (
      p_order_id, p_user_id, p_request_id, p_input_hash, p_plan, p_amount, p_currency, p_livemode,
      'paid', p_session_id, now()
    ) ON CONFLICT (id) DO NOTHING;
    inserted := FOUND;
  END IF;

  PERFORM 1 FROM public.shipandbattle_launch_orders WHERE id = p_order_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.shipandbattle_launch_payment_events WHERE id = deleted_id) THEN
    -- If the INSERT waited for a concurrent deletion, roll it back. The next delivery sees the marker first.
    IF inserted THEN RAISE EXCEPTION 'Order deleted concurrently' USING ERRCODE = '40001'; END IF;
    RETURN;
  END IF;

  PERFORM public.shipandbattle_apply_launch_checkout_event(
    p_event_id, p_event_type, p_order_id, p_user_id, p_session_id, p_plan, p_amount,
    p_currency, p_livemode, p_status, p_payment_intent
  );
END;
$$;

REVOKE ALL ON FUNCTION public.shipandbattle_record_launch_checkout_event(text,text,uuid,uuid,text,text,integer,text,boolean,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shipandbattle_record_launch_checkout_event(text,text,uuid,uuid,text,text,integer,text,boolean,text,text,uuid,text) TO service_role;

COMMIT;
