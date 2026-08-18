-- Pausa da emissão de notas fiscais, ligada e desligada pelo operador de caixa.
--
-- Enquanto está pausada, o caixa continua vendendo e cobrando normalmente, mas
-- o botão de emitir NFC-e sai do ar. As vendas do período ficam sem nota, e
-- quem decide o que fazer com elas depois é o lojista.
--
-- Por isso a pausa é gravada como JANELA (início e fim), e não como um simples
-- booleano: sem saber quando começou e quando terminou, não há como listar
-- depois quais vendas passaram por ela. É o registro da janela que torna o
-- "decido depois" possível.
--
-- Tabela própria, e não uma coluna em tenant_fiscal_config, porque a pausa é um
-- evento com histórico — e porque a config fiscal nem sempre existe para o
-- tenant, enquanto o caixa existe sempre.

create table if not exists public.pdv_fiscal_pauses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,

  started_at timestamptz not null default now(),
  started_by uuid,
  started_by_name text,

  ended_at timestamptz,
  ended_by uuid,
  ended_by_name text,

  -- Em qual caixa a pausa aconteceu. Ajuda a achar as vendas do período.
  cashier_session_id uuid,
  reason text,

  created_at timestamptz not null default now()
);

comment on table public.pdv_fiscal_pauses is
  'Janelas em que a emissão de NFC-e ficou pausada. ended_at nulo = pausa em curso.';

-- Uma pausa em curso por estabelecimento. Dois operadores clicando ao mesmo
-- tempo não podem abrir duas janelas sobrepostas.
create unique index if not exists uq_fiscal_pause_ativa
  on public.pdv_fiscal_pauses (user_id)
  where ended_at is null;

create index if not exists idx_fiscal_pauses_periodo
  on public.pdv_fiscal_pauses (user_id, started_at desc);

alter table public.pdv_fiscal_pauses enable row level security;

drop policy if exists "Establishment can view fiscal pauses" on public.pdv_fiscal_pauses;
create policy "Establishment can view fiscal pauses"
  on public.pdv_fiscal_pauses for select
  using (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Establishment can start fiscal pause" on public.pdv_fiscal_pauses;
create policy "Establishment can start fiscal pause"
  on public.pdv_fiscal_pauses for insert
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));

drop policy if exists "Establishment can end fiscal pause" on public.pdv_fiscal_pauses;
create policy "Establishment can end fiscal pause"
  on public.pdv_fiscal_pauses for update
  using (auth.uid() = user_id or public.is_establishment_member(user_id))
  with check (auth.uid() = user_id or public.is_establishment_member(user_id));
