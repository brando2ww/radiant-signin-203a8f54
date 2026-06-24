-- Add email report fields to operational_task_settings
ALTER TABLE public.operational_task_settings
  ADD COLUMN IF NOT EXISTS email_report_enabled             BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_report_address             TEXT,
  ADD COLUMN IF NOT EXISTS email_report_time                TEXT DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS email_report_include_checklists  BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_report_include_tasks       BOOLEAN DEFAULT true;

-- Audit log for email report sends
CREATE TABLE IF NOT EXISTS public.checklist_report_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  report_date     DATE        NOT NULL,
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipient_email TEXT,
  status          TEXT        NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message   TEXT,
  stats           JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_report_logs_user_date
  ON public.checklist_report_logs(user_id, report_date);

ALTER TABLE public.checklist_report_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all" ON public.checklist_report_logs
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
