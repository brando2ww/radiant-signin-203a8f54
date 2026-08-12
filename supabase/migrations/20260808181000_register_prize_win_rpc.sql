-- Correção 3: emissão de cupom vira uma operação atômica no servidor.
-- Antes: o navegador sorteava o código, dava INSERT direto e não conseguia ler a linha de volta
-- (RLS bloqueava o RETURNING), então o cupom aparecia na tela mesmo sem confirmação real.

create or replace function public.register_prize_win(
  p_campaign_id uuid,
  p_prize_id uuid,
  p_evaluation_id uuid,
  p_customer_name text,
  p_customer_whatsapp text
)
returns table (coupon_code text, coupon_expires_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_prize   public.campaign_prizes%rowtype;
  v_code    text;
  v_expires timestamptz;
  v_letters constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_attempt int;
begin
  select * into v_prize
  from public.campaign_prizes
  where id = p_prize_id and campaign_id = p_campaign_id;

  if not found then
    -- prêmio apagado ou editado enquanto o cliente respondia o formulário
    raise exception 'PRIZE_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- idempotente: se essa avaliação já tem cupom, devolve o mesmo
  select w.coupon_code, w.coupon_expires_at into v_code, v_expires
  from public.campaign_prize_wins w
  where w.evaluation_id = p_evaluation_id;

  if v_code is not null then
    return query select v_code, v_expires;
    return;
  end if;

  v_expires := now() + make_interval(days => greatest(coalesce(v_prize.coupon_validity_days, 30), 1));

  for v_attempt in 1..10 loop
    v_code := (
      select string_agg(substr(v_letters, 1 + floor(random() * 24)::int, 1), '')
      from generate_series(1, 3)
    ) || '-' || lpad((1000 + floor(random() * 9000))::int::text, 4, '0');

    begin
      insert into public.campaign_prize_wins (
        campaign_id, prize_id, evaluation_id,
        customer_name, customer_whatsapp, coupon_code, coupon_expires_at
      ) values (
        p_campaign_id, p_prize_id, p_evaluation_id,
        p_customer_name, p_customer_whatsapp, v_code, v_expires
      );

      update public.campaign_prizes
        set redeemed_count = redeemed_count + 1
      where id = p_prize_id;

      return query select v_code, v_expires;
      return;

    exception when unique_violation then
      -- pode ser colisão de código (tenta outro) ou corrida na mesma avaliação (devolve o existente)
      select w.coupon_code, w.coupon_expires_at into v_code, v_expires
      from public.campaign_prize_wins w
      where w.evaluation_id = p_evaluation_id;

      if v_code is not null then
        return query select v_code, v_expires;
        return;
      end if;
    end;
  end loop;

  raise exception 'CODE_GENERATION_FAILED';
end;
$$;

grant execute on function public.register_prize_win(uuid, uuid, uuid, text, text) to anon, authenticated;

-- Correção 4: falha de emissão deixa rastro em vez de sumir.
create table if not exists public.campaign_prize_win_failures (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.evaluation_campaigns(id) on delete cascade,
  prize_id uuid,                       -- sem FK de propósito: o prêmio pode ter sido apagado
  evaluation_id uuid,
  customer_name text,
  customer_whatsapp text,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_prize_win_failures_campaign
  on public.campaign_prize_win_failures (campaign_id, created_at desc);

alter table public.campaign_prize_win_failures enable row level security;

drop policy if exists "Anyone can log a failure" on public.campaign_prize_win_failures;
create policy "Anyone can log a failure"
  on public.campaign_prize_win_failures for insert
  with check (true);

drop policy if exists "Establishment can read failures" on public.campaign_prize_win_failures;
create policy "Establishment can read failures"
  on public.campaign_prize_win_failures for select
  using (campaign_id in (
    select c.id from public.evaluation_campaigns c where public.can_access_owner(c.user_id)
  ));
