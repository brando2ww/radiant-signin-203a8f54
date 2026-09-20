-- Relatório de checklist para mais de um destinatário.
--
-- Até aqui era um endereço só (email_report_address), e o dono precisava
-- reencaminhar o relatório à mão para o gerente e para o supervisor. A coluna
-- antiga continua valendo como primeiro destinatário, para não quebrar quem já
-- tinha configurado.
alter table public.operational_task_settings
  add column if not exists email_report_addresses text[] not null default '{}';

comment on column public.operational_task_settings.email_report_addresses is
  'Destinatários adicionais do relatório diário. O email_report_address segue sendo o principal.';
