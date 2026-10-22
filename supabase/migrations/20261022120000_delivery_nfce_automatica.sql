-- NFC-e automática do delivery, emitida pelo SERVIDOR.
--
-- Antes a nota do delivery só saía pelo navegador, no momento em que alguém
-- marcava o pedido como concluído na tela, e só no caminho do pedido próprio.
-- Pedido do iFood nunca passava por ali: a conclusão chega pelo evento da
-- plataforma, no servidor. Resultado medido em 22/10/2026: 72 pedidos do iFood
-- concluídos no Kōten Garibaldi em 14 dias, nenhum com cupom.
--
-- Agora uma varredura (função `delivery-nfce`, cron a cada minuto) reserva os
-- pedidos concluídos e pagos das lojas com a opção ligada e emite um a um.

-- Quando a opção foi ligada. A varredura só pega pedidos concluídos DEPOIS
-- disso: ligar a opção não pode sair emitindo nota de pedido antigo.
alter table public.delivery_settings
  add column if not exists nfce_auto_emit_desde timestamptz;

create or replace function public.delivery_settings_nfce_desde()
returns trigger
language plpgsql
as $$
begin
  if new.nfce_auto_emit
     and (tg_op = 'INSERT' or not coalesce(old.nfce_auto_emit, false)) then
    new.nfce_auto_emit_desde := now();
  elsif not new.nfce_auto_emit then
    new.nfce_auto_emit_desde := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_delivery_settings_nfce_desde on public.delivery_settings;
create trigger trg_delivery_settings_nfce_desde
  before insert or update of nfce_auto_emit on public.delivery_settings
  for each row execute function public.delivery_settings_nfce_desde();

-- Uma tentativa automática por pedido. Fica fora de delivery_orders de
-- propósito: mexer no pedido mudaria o updated_at e acordaria a tela em
-- tempo real de todo mundo por causa de uma coluna de controle.
create table if not exists public.delivery_nfce_tentativas (
  order_id uuid primary key references public.delivery_orders(id) on delete cascade,
  user_id uuid not null,
  tentativa_em timestamptz not null default now(),
  -- Preenchido quando a nota não saiu antes de chegar à SEFAZ (ex.: produto
  -- sem NCM). Rejeição da SEFAZ fica na própria nota, em notas_fiscais.
  erro text,
  nota_id uuid
);

alter table public.delivery_nfce_tentativas enable row level security;

drop policy if exists delivery_nfce_tentativas_owner_select on public.delivery_nfce_tentativas;
create policy delivery_nfce_tentativas_owner_select
  on public.delivery_nfce_tentativas for select
  using (auth.uid() = user_id);

-- Duas emissões do mesmo pedido ao mesmo tempo esbarram aqui: a segunda não
-- consegue gravar a nota "processando" e para antes de chamar a Focus.
create unique index if not exists uniq_notas_fiscais_delivery_ativa
  on public.notas_fiscais (origem_id)
  where origem_tipo = 'delivery_order' and status in ('processando', 'autorizada');

-- Reserva os próximos pedidos a emitir. A reserva (insert na tabela de
-- tentativas) acontece na mesma transação da escolha, então duas varreduras
-- simultâneas nunca pegam o mesmo pedido.
--
-- Entra: concluído, pago, loja com a opção ligada, concluído depois de ligar
-- e nas últimas 24 h, sem nota nenhuma (rejeitada também conta: essa vai
-- para a revisão manual), sem tentativa. Tentativa interrompida (sem erro e
-- sem nota há 15 min) volta para a fila. Erro de cadastro (produto sem NCM)
-- é tentado de novo a cada hora: o gerente corrige o produto e a nota sai
-- sozinha, sem ninguém precisar reemitir.
create or replace function public.delivery_nfce_reservar(p_limite int default 10)
returns table (order_id uuid, user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
-- order_id/user_id são nomes de coluna E das colunas de retorno.
#variable_conflict use_column
begin
  return query
  with candidatos as (
    select d.id, d.user_id
      from delivery_orders d
      join delivery_settings ds on ds.user_id = d.user_id and ds.nfce_auto_emit
      left join delivery_nfce_tentativas t on t.order_id = d.id
     where d.status = 'completed'
       and d.payment_status = 'paid'
       and coalesce(d.delivered_at, d.updated_at)
           >= greatest(now() - interval '24 hours', coalesce(ds.nfce_auto_emit_desde, now()))
       and (t.order_id is null
            or (t.erro is null and t.nota_id is null and t.tentativa_em < now() - interval '15 minutes')
            or (t.erro is not null and t.tentativa_em < now() - interval '1 hour'))
       and not exists (
         select 1 from notas_fiscais n
          where n.origem_tipo = 'delivery_order' and n.origem_id = d.id::text)
     order by coalesce(d.delivered_at, d.updated_at)
     limit greatest(1, least(p_limite, 50))
     for update of d skip locked
  ),
  reservados as (
    insert into delivery_nfce_tentativas as t (order_id, user_id, tentativa_em)
    select c.id, c.user_id, now() from candidatos c
    on conflict (order_id) do update
      set tentativa_em = excluded.tentativa_em, erro = null
    returning t.order_id, t.user_id
  )
  select r.order_id, r.user_id from reservados r;
end;
$$;

revoke all on function public.delivery_nfce_reservar(int) from public, anon, authenticated;
grant execute on function public.delivery_nfce_reservar(int) to service_role;
