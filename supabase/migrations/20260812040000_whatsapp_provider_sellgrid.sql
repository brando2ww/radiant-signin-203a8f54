-- Provedor de WhatsApp por estabelecimento.
--
-- Entra a SellGrid (Z-PRO), que envia pelo número oficial da Velara. Diferente
-- do Evolution, não existe instância por cliente: o canal é da plataforma, e a
-- conexão aqui serve só para registrar QUAL estabelecimento escolheu usá-lo.
-- Por isso instance_name passa a ser opcional.
--
-- O Evolution continua intacto: quem já está conectado por QR não é tocado.

alter table public.whatsapp_connections
  add column if not exists provider text not null default 'evolution';

alter table public.whatsapp_connections
  drop constraint if exists whatsapp_connections_provider_check;

alter table public.whatsapp_connections
  add constraint whatsapp_connections_provider_check
  check (provider in ('evolution', 'sellgrid', 'cloud'));

alter table public.whatsapp_connections
  alter column instance_name drop not null;

-- Um estabelecimento só pode ter uma conexão por provedor. Sem isso, clicar
-- duas vezes em "usar número da Velara" criaria linhas duplicadas e o resolver
-- passaria a depender de ordenação para escolher.
create unique index if not exists uq_wa_conn_user_provider
  on public.whatsapp_connections (user_id, provider);

comment on column public.whatsapp_connections.provider is
  'evolution = QR Code (número do próprio cliente) · sellgrid = número oficial da Velara via Z-PRO · cloud = API oficial da Meta (ainda não implementada)';

-- whatsapp_messages já aceita provider livre no check original; incluir sellgrid.
alter table public.whatsapp_messages
  drop constraint if exists whatsapp_messages_provider_check;

alter table public.whatsapp_messages
  add constraint whatsapp_messages_provider_check
  check (provider in ('evolution', 'sellgrid', 'cloud'));
