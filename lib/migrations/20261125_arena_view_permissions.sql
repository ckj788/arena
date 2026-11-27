BEGIN;

-- Clients read Arena results through these views and submit votes through the RPC.
REVOKE INSERT, UPDATE, DELETE ON
  public.shipandbattle_public_brackets,
  public.shipandbattle_public_matches,
  public.shipandbattle_public_votes
FROM PUBLIC, anon, authenticated;

COMMIT;
