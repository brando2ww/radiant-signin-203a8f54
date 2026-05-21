DO $$
BEGIN
  ALTER TABLE public.checklist_executions REPLICA IDENTITY FULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.checklist_executions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;