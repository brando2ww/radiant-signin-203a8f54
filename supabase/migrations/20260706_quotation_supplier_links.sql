-- Link público por (cotação + fornecedor): o fornecedor preenche o orçamento
-- num formulário público (rota /cotacao/:token), sem login. Substitui a coleta
-- de respostas por texto no WhatsApp.

create table if not exists public.pdv_quotation_supplier_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  quotation_request_id uuid not null references public.pdv_quotation_requests(id) on delete cascade,
  supplier_id uuid not null references public.pdv_suppliers(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  status text not null default 'pending', -- pending | submitted
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  submitted_at timestamptz,
  unique (quotation_request_id, supplier_id)
);

create unique index if not exists idx_qsl_token on public.pdv_quotation_supplier_links(token);
create index if not exists idx_qsl_request on public.pdv_quotation_supplier_links(quotation_request_id);

alter table public.pdv_quotation_supplier_links enable row level security;

-- Apenas o dono da cotação (tenant) enxerga/gere seus links.
-- O acesso público do fornecedor é feito por Edge Function service-role
-- protegida pelo token, então NÃO há policy anônima aqui.
drop policy if exists "owner_all_qsl" on public.pdv_quotation_supplier_links;
create policy "owner_all_qsl" on public.pdv_quotation_supplier_links
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime para o painel ver o envio do fornecedor ao vivo.
alter table public.pdv_quotation_supplier_links replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.pdv_quotation_supplier_links;
exception when duplicate_object then null;
end $$;

-- Garante realtime também nas respostas (o formulário grava aqui com source='link').
alter table public.pdv_quotation_responses replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.pdv_quotation_responses;
exception when duplicate_object then null;
end $$;
