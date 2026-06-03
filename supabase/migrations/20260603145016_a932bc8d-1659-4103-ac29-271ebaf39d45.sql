DROP POLICY IF EXISTS "Anyone can read wins" ON public.campaign_prize_wins;

CREATE POLICY "Owner can read wins"
ON public.campaign_prize_wins
FOR SELECT
USING (
  campaign_id IN (
    SELECT id FROM public.evaluation_campaigns WHERE user_id = auth.uid()
  )
);