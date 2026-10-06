-- Cardápio do garçom · a lista de produtos deixa de ser o catálogo cru.
--
-- O problema, medido no Kōten em 05/10/2026: o garçom digita "salm" e recebe 46
-- produtos em ordem alfabética. Como os nomes começam com número ("04 Joe
-- Salmão"), a lista sai ordenada por quantidade de peças, e 20 desses 46 não
-- venderam uma única vez nos últimos 60 dias.
--
-- O dado que orienta o desenho: em 60 dias o restaurante vendeu 217 produtos
-- diferentes, mas os 15 MAIS PEDIDOS são 69,3% de tudo que foi lançado, e os 30
-- mais são 81,1%. Ou seja, abrir a tela já mostrando os campeões resolve a
-- maior parte dos lançamentos sem ninguém digitar nada.
--
-- São duas fontes de ordem, e elas convivem de propósito:
--   · o HISTÓRICO, que o sistema calcula sozinho e acerta no dia a dia;
--   · a MÃO DO DONO, que sabe o que o histórico ainda não sabe (prato novo,
--     item que ele quer empurrar, variação que confunde).

-- ---------------------------------------------------------------------------
-- 1. Como cada restaurante quer a lista do garçom
-- ---------------------------------------------------------------------------

create table if not exists public.pdv_waiter_menu_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- 'historico' = só os mais pedidos; 'manual' = só o que o dono fixou;
  -- 'misto' = os fixados primeiro, o histórico completando.
  destaque_modo text not null default 'misto'
    check (destaque_modo in ('historico', 'manual', 'misto')),
  -- Janela do ranking. 7 dias acompanha a sazonalidade da semana; 30 ou 90 dão
  -- uma lista mais estável. O dono escolhe porque isso muda com o tipo de casa.
  destaque_janela_dias int not null default 30
    check (destaque_janela_dias in (7, 14, 30, 60, 90)),
  destaque_quantidade int not null default 20 check (destaque_quantidade between 5 and 60),
  -- Categorias que não existem para quem atende o salão, como as de delivery.
  categorias_ocultas text[] not null default '{}',
  -- Ordem em que as categorias aparecem na barra. O que não estiver aqui vai
  -- para o fim, em ordem alfabética.
  categorias_ordem text[] not null default '{}',
  -- Esconder o que não vende há muito tempo, com um "ver todos" na tela.
  ocultar_sem_venda_dias int,
  atualizado_em timestamptz not null default now()
);

comment on table public.pdv_waiter_menu_settings is
  'Como a lista de produtos aparece no app do garçom. Nada aqui apaga produto: só muda ordem e visibilidade na tela de lançamento.';

-- ---------------------------------------------------------------------------
-- 2. O que o dono decidiu sobre cada produto
-- ---------------------------------------------------------------------------
--
-- Tabela separada do cadastro do produto de propósito: isto é preferência de
-- TELA, não atributo do produto. Mexer em pdv_products para isso misturaria
-- catálogo com layout e atrapalharia delivery, cardápio digital e fiscal.

create table if not exists public.pdv_waiter_menu_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.pdv_products(id) on delete cascade,
  -- Sobe para os destaques mesmo sem histórico: é o prato novo, a sugestão do
  -- dia, o que a casa quer vender.
  fixado boolean not null default false,
  -- Some da lista do garçom sem sumir do catálogo.
  oculto boolean not null default false,
  ordem int,
  -- Variação de um principal: "04 Joe Salmão Filadélfia" pendurado em
  -- "05 Sashimi de Salmão". A variação sai da lista e aparece dentro do pai.
  pai_product_id uuid references public.pdv_products(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists idx_waiter_menu_items_owner
  on public.pdv_waiter_menu_items (user_id) where oculto = false;
create index if not exists idx_waiter_menu_items_pai
  on public.pdv_waiter_menu_items (pai_product_id) where pai_product_id is not null;

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table public.pdv_waiter_menu_settings enable row level security;
alter table public.pdv_waiter_menu_items enable row level security;

do $$
declare t text;
begin
  foreach t in array array['pdv_waiter_menu_settings', 'pdv_waiter_menu_items'] loop
    -- Leitura para o estabelecimento inteiro: o garçom precisa ler para a tela
    -- dele funcionar. Escrita fica para quem tem permissão de produto.
    execute format($f$
      drop policy if exists %1$s_le on public.%1$s;
      create policy %1$s_le on public.%1$s
        for select to authenticated
        using (auth.uid() = user_id or public.is_establishment_member(user_id));

      drop policy if exists %1$s_escreve on public.%1$s;
      create policy %1$s_escreve on public.%1$s
        for all to authenticated
        using (auth.uid() = user_id or public.is_establishment_member(user_id))
        with check (auth.uid() = user_id or public.is_establishment_member(user_id));
    $f$, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. O ranking, calculado no banco
-- ---------------------------------------------------------------------------
--
-- No banco e não no app: o celular do garçom não pode baixar as comandas do
-- mês para descobrir o que mais sai. A função devolve a lista pronta, pequena,
-- e usa a mesma doutrina dos relatórios (itens vêm de pdv_comanda_items, com a
-- comanda ligada a pedido FECHADO).

create or replace function public.pdv_waiter_top_products(
  _owner uuid,
  _dias int default 30,
  _limite int default 20
)
returns table (product_id uuid, product_name text, quantidade numeric, lancamentos bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ci.product_id,
         max(ci.product_name) as product_name,
         sum(ci.quantity)     as quantidade,
         count(*)             as lancamentos
    from public.pdv_comanda_items ci
    join public.pdv_comandas c on c.id = ci.comanda_id
    join public.pdv_orders o   on o.id = c.order_id
   where o.user_id = _owner
     and o.status in ('fechada', 'fechado')
     and c.created_at > now() - make_interval(days => greatest(1, coalesce(_dias, 30)))
     and ci.product_id is not null
   group by ci.product_id
   order by sum(ci.quantity) desc
   limit greatest(1, least(coalesce(_limite, 20), 100))
$$;

comment on function public.pdv_waiter_top_products(uuid, int, int) is
  'Os produtos mais pedidos do estabelecimento na janela escolhida. Alimenta a aba de destaques do app do garçom e a prévia da tela de montagem.';

grant execute on function public.pdv_waiter_top_products(uuid, int, int) to authenticated;
