-- Aplicado em prod (frbziqazwhymwsrtneoy) 03/07/2026 via Management API.
-- Cria as tabelas de emissão que as edge functions Focus usavam mas que nunca foram criadas em prod.

-- Fundação fiscal: tabelas de emissão que as edge functions Focus usam mas que
-- NUNCA foram criadas (nenhuma migration as cria; não existem em prod).
-- Schema derivado do que emitir-nfce/nfe, consultar-nota, webhook-receiver,
-- cancelar-nota e carta-correcao gravam/leem + interface NotaFiscal do frontend.

create table if not exists public.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tipo text not null,                       -- nfce | nfe | nfse
  ambiente text,                            -- producao | homologacao
  referencia_focusnfe text,                 -- ref usada no matching do webhook
  numero text,
  serie text,
  chave_acesso text,
  protocolo text,
  status text not null default 'processando',
  valor_total numeric,
  destinatario_nome text,
  destinatario_documento text,
  destinatario_email text,
  caminho_xml text,
  caminho_danfe text,
  payload_enviado jsonb,
  resposta_api jsonb,
  origem_tipo text,
  origem_id text,
  cancelamento_justificativa text,
  cancelada_em timestamptz,
  mensagem_sefaz text,
  emitida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_notas_fiscais_user on public.notas_fiscais(user_id);
create index if not exists idx_notas_fiscais_ref on public.notas_fiscais(referencia_focusnfe);
create index if not exists idx_notas_fiscais_user_tipo_created on public.notas_fiscais(user_id, tipo, created_at desc);

alter table public.notas_fiscais enable row level security;
drop policy if exists "notas_fiscais_owner_all" on public.notas_fiscais;
create policy "notas_fiscais_owner_all" on public.notas_fiscais
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.notas_fiscais_cartas_correcao (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas_fiscais(id) on delete cascade,
  sequencia integer not null,
  correcao text not null,
  protocolo text,
  status text default 'registrada',
  xml_url text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ncc_nota on public.notas_fiscais_cartas_correcao(nota_id);

alter table public.notas_fiscais_cartas_correcao enable row level security;
drop policy if exists "ncc_owner_all" on public.notas_fiscais_cartas_correcao;
create policy "ncc_owner_all" on public.notas_fiscais_cartas_correcao
  for all to authenticated
  using (exists (select 1 from public.notas_fiscais n where n.id = nota_id and n.user_id = auth.uid()))
  with check (exists (select 1 from public.notas_fiscais n where n.id = nota_id and n.user_id = auth.uid()));
