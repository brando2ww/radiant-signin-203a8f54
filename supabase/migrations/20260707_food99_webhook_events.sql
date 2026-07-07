-- Captura de eventos do webhook do 99Food (fase 1: recebe e guarda o payload cru).
-- O mapeamento para delivery_orders vem depois, quando tivermos a spec/payload real.
create table if not exists public.food99_webhook_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,               -- loja (vem do ?store= na URL registrada no 99Food)
  event_type text,            -- tipo do evento, se identificável no payload
  external_order_id text,     -- id do pedido no 99Food, se presente
  payload jsonb not null,
  headers jsonb,
  processed boolean not null default false,
  received_at timestamptz not null default now()
);

create index if not exists idx_food99_events_user on public.food99_webhook_events(user_id, received_at desc);

alter table public.food99_webhook_events enable row level security;

drop policy if exists "owner_read_food99" on public.food99_webhook_events;
create policy "owner_read_food99" on public.food99_webhook_events
  for select to authenticated
  using (auth.uid() = user_id);
