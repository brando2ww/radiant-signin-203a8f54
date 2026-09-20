-- Registro dos pedidos de recuperação de senha, só para limitar abuso.
--
-- O e-mail sai pelo NOSSO SMTP (função send-password-reset) e não pelo servidor
-- padrão do Supabase, que é compartilhado e aceita 2 mensagens por hora no
-- projeto inteiro. Com o padrão, o segundo cliente que pedisse a senha no mesmo
-- horário simplesmente não receberia nada.
create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  requested_at timestamptz not null default now(),
  sent boolean not null default false,
  error_message text
);

create index if not exists idx_password_reset_requests_email_time
  on public.password_reset_requests (lower(email), requested_at desc);

-- Sem política nenhuma: a tabela só é acessível pelo service_role da função.
alter table public.password_reset_requests enable row level security;
