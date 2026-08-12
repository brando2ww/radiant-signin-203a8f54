-- Fundação do WhatsApp: log de mensagens, correção da colisão de instância e
-- registro da tabela de inbound que existia em produção sem migration.
--
-- Nada aqui muda comportamento de envio. É o que permite (a) enxergar o que foi
-- enviado e o que falhou, hoje invisível, e (b) receber os status de entrega
-- quando a API oficial da Meta entrar.

-- ---------------------------------------------------------------------------
-- 1) Log de mensagens · serve aos dois provedores
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  -- null = canal global da Velara (2FA e verificação de número, que saem de um
  -- número da plataforma e não do estabelecimento).
  user_id uuid,
  connection_id uuid references public.whatsapp_connections(id) on delete set null,
  provider text not null check (provider in ('evolution','cloud')),
  direction text not null check (direction in ('outbound','inbound')),
  purpose text,
  to_phone text,
  from_phone text,
  kind text not null default 'text' check (kind in ('text','template')),
  template_name text,
  template_language text,
  template_variables jsonb,
  -- Fica nulo quando o conteúdo é sensível: a mensagem de 2FA carrega o código
  -- de 6 dígitos no corpo, e esta tabela é lida pelo dono do estabelecimento.
  body text,
  provider_message_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','read','failed')),
  status_at timestamptz,
  error_code text,
  error_message text,
  -- Cobrança da Meta. Guardamos o objeto cru do webhook em vez de derivar preço:
  -- o modelo já mudou (por conversa → por mensagem) e vai mudar de novo.
  conversation_id text,
  conversation_category text,
  billable boolean,
  pricing jsonb,
  entity_type text,
  entity_id uuid,
  supplier_id uuid,
  created_at timestamptz not null default now()
);

-- A Meta reenvia o mesmo wamid; o Evolution pode repetir o mesmo key.id.
create unique index if not exists uq_wa_messages_provider_msg
  on public.whatsapp_messages (provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists idx_wa_messages_user_created
  on public.whatsapp_messages (user_id, created_at desc);

-- Consulta da janela de 24h: "este contato me escreveu nas últimas 24h?".
create index if not exists idx_wa_messages_window
  on public.whatsapp_messages (user_id, from_phone, created_at desc)
  where direction = 'inbound';

alter table public.whatsapp_messages enable row level security;

drop policy if exists "tenant lê suas mensagens de whatsapp" on public.whatsapp_messages;
create policy "tenant lê suas mensagens de whatsapp" on public.whatsapp_messages
  for select to authenticated
  using (
    user_id is not null
    and (user_id = auth.uid() or public.is_establishment_member(user_id))
  );
-- Sem INSERT/UPDATE para authenticated: só service_role escreve. E user_id nulo
-- (canal global) nunca é legível — seriam mensagens da Velara para outros
-- clientes.

comment on table public.whatsapp_messages is
  'Log de todas as mensagens de WhatsApp, dos dois provedores. Escrito só por service_role.';

-- ---------------------------------------------------------------------------
-- 2) Colisão de instância
-- ---------------------------------------------------------------------------
-- O namespace de instâncias do Evolution é GLOBAL, mas a unicidade no banco era
-- só (user_id, instance_name), e o nome vinha do texto digitado pelo usuário.
-- Dois estabelecimentos com "Restaurante" apontavam para a mesma instância — e
-- o webhook, que resolve o tenant por instance_name com maybeSingle(), passava a
-- devolver erro e descartar o inbound com HTTP 200, em silêncio.
--
-- Verificado antes de aplicar: não há duplicata exata em produção (há "compras"
-- e "Compras", que o Postgres distingue). Instâncias já conectadas NÃO são
-- renomeadas: renomear no Evolution equivale a recriar, o que obrigaria o
-- cliente a ler o QR de novo.
create unique index if not exists uq_wa_conn_instance_name
  on public.whatsapp_connections (instance_name)
  where instance_name is not null;

-- ---------------------------------------------------------------------------
-- 3) Dívida: tabela que existia em produção sem migration
-- ---------------------------------------------------------------------------
-- Criada fora do versionamento e ausente dos types gerados, o que obrigava os
-- hooks a usar `as any`. Espelha exatamente o schema de produção.
create table if not exists public.pdv_quotation_inbound_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  instance_name text,
  from_phone text not null,
  supplier_id uuid,
  quotation_request_id uuid,
  body text,
  parsed jsonb,
  status text not null default 'pending',
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.pdv_quotation_inbound_messages enable row level security;

drop policy if exists "tenant gerencia inbound de cotação" on public.pdv_quotation_inbound_messages;
create policy "tenant gerencia inbound de cotação" on public.pdv_quotation_inbound_messages
  for all to authenticated
  using (user_id = auth.uid() or public.is_establishment_member(user_id))
  with check (user_id = auth.uid() or public.is_establishment_member(user_id));
