export type LaunchOrderSummary = {
  id: string;
  plan: string;
  status: string;
  amount_total: number;
  currency: string;
  details_submitted_at: string | null;
  created_at?: string;
  paid_at?: string | null;
  livemode?: boolean;
  product_name?: string | null;
  draft_saved_at?: string | null;
};
