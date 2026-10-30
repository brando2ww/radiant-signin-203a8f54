begin;
alter table public.checklist_execution_items add column if not exists photo_expired_at timestamptz;
comment on column public.checklist_execution_items.photo_expired_at is 'Foto removida após o prazo de retenção; resposta, horário e revisão permanecem.';
notify pgrst,'reload schema';
commit;
