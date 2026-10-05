-- Velara · Força de vendas · agenda: o representante só liga compromisso a cliente da carteira dele e a proposta dele
-- (05/10/2026). Só acréscimo sobre a fundação (20261005120100_vendas_fundacao.sql).
--
-- A fundação confere o cliente na inclusão (vendas_agenda_nova). Faltavam dois casos que o representante consegue pela
-- API: trocar o cliente de um compromisso já gravado por um cliente fora da carteira, e ligar o compromisso a uma
-- proposta de outro representante. Dono, gerente e financeiro seguem livres.
-- Roda depois de vendas_agenda_nova na inclusão (gatilhos BEFORE disparam em ordem alfabética), com o representante já
-- preenchido.

create or replace function public.vendas_agenda_vinculos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rep uuid;
begin
  if not public.vendas_e_representante() then
    return new;
  end if;
  v_rep := public.vendas_rep_id();
  if tg_op = 'UPDATE' and new.customer_id is not null and new.customer_id is distinct from old.customer_id
     and not exists (select 1 from public.pdv_customers c where c.id = new.customer_id and c.representative_id = v_rep) then
    raise exception 'Este cliente não está na sua carteira.' using errcode = '42501';
  end if;
  if new.proposta_id is not null and (tg_op = 'INSERT' or new.proposta_id is distinct from old.proposta_id)
     and not exists (select 1 from public.vendas_propostas p where p.id = new.proposta_id and p.representative_id = v_rep) then
    raise exception 'Esta proposta não é sua.' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger vendas_agenda_vinculos before insert or update of customer_id, proposta_id on public.vendas_agenda
  for each row execute function public.vendas_agenda_vinculos();
