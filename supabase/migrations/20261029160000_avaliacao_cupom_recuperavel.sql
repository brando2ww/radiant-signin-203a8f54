-- A avaliação não perde o prêmio se o navegador recarregar ou compartilhar o aparelho.
begin;
create or replace function public.evaluation_reward_issue(p_evaluation_id uuid, p_prize_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.customer_evaluations; c public.evaluation_campaigns; p public.campaign_prizes;
  w public.campaign_prize_wins; phone text; result record;
begin
  select * into e from public.customer_evaluations where id=p_evaluation_id for update;
  if not found then raise exception 'Avaliação não encontrada' using errcode='P0002'; end if;
  select * into c from public.evaluation_campaigns where id=e.campaign_id and user_id=e.user_id;
  if c.id is null then raise exception 'Campanha inválida' using errcode='42501'; end if;
  select * into w from public.campaign_prize_wins where evaluation_id=e.id;
  if found then
    return jsonb_build_object('status','issued','coupon_code',w.coupon_code,'coupon_expires_at',w.coupon_expires_at,
      'prize_name',(select name from public.campaign_prizes where id=w.prize_id));
  end if;
  if not c.is_active or not c.roulette_enabled then return jsonb_build_object('status','disabled'); end if;
  phone := regexp_replace(coalesce(e.customer_whatsapp,''),'\D','','g');
  if length(phone)>11 and left(phone,2)='55' then phone:=substr(phone,3); end if;
  if length(phone) not in (10,11) then raise exception 'Informe um telefone válido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(c.id::text||':'||phone,0));
  if coalesce(c.roulette_cooldown_hours,0)>0 and exists(
    select 1 from public.campaign_prize_wins prev
    where prev.campaign_id=c.id
      and right(regexp_replace(prev.customer_whatsapp,'\D','','g'),length(phone))=phone
      and prev.created_at>now()-make_interval(hours=>c.roulette_cooldown_hours::int)
  ) then return jsonb_build_object('status','cooldown','cooldown_hours',c.roulette_cooldown_hours); end if;
  -- Ao perder o sorteio local, o servidor sorteia entre os prêmios disponíveis.
  select * into p from public.campaign_prizes
    where campaign_id=c.id and is_active and probability>0
      and (max_quantity is null or redeemed_count<max_quantity)
      and (p_prize_id is null or id=p_prize_id)
    order by -ln(greatest(random(),0.000000001))/probability limit 1 for update;
  if p.id is null then return jsonb_build_object('status','unavailable'); end if;
  select * into result from public.register_prize_win(c.id,p.id,e.id,e.customer_name,e.customer_whatsapp);
  return jsonb_build_object('status','issued','coupon_code',result.coupon_code,'coupon_expires_at',result.coupon_expires_at,'prize_name',p.name);
end $$;
revoke all on function public.evaluation_reward_issue(uuid,uuid) from public;
grant execute on function public.evaluation_reward_issue(uuid,uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;
