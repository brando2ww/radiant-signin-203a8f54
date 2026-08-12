-- Correção 1: escopo de estabelecimento (funcionários) no módulo de avaliações.
-- Antes: todas as policies comparavam com auth.uid() = dono da campanha, então qualquer
-- funcionário logado enxergava ZERO cupons e não conseguia resgatar nenhum.

-- campanhas: dono ou membro ativo do estabelecimento
drop policy if exists "Establishment can read campaigns" on public.evaluation_campaigns;
create policy "Establishment can read campaigns"
  on public.evaluation_campaigns for select
  using (public.can_access_owner(user_id));

-- cupons: leitura
drop policy if exists "Owner can read wins" on public.campaign_prize_wins;
drop policy if exists "Establishment can read wins" on public.campaign_prize_wins;
create policy "Establishment can read wins"
  on public.campaign_prize_wins for select
  using (campaign_id in (
    select c.id from public.evaluation_campaigns c where public.can_access_owner(c.user_id)
  ));

-- cupons: resgate (update)
drop policy if exists "Owner can update wins" on public.campaign_prize_wins;
drop policy if exists "Establishment can update wins" on public.campaign_prize_wins;
create policy "Establishment can update wins"
  on public.campaign_prize_wins for update
  using (campaign_id in (
    select c.id from public.evaluation_campaigns c where public.can_access_owner(c.user_id)
  ))
  with check (campaign_id in (
    select c.id from public.evaluation_campaigns c where public.can_access_owner(c.user_id)
  ));

-- avaliações e respostas: mesma régua
drop policy if exists "Usuários podem ver suas próprias avaliações" on public.customer_evaluations;
drop policy if exists "Establishment can read evaluations" on public.customer_evaluations;
create policy "Establishment can read evaluations"
  on public.customer_evaluations for select
  using (public.can_access_owner(user_id));

drop policy if exists "Usuários podem ver respostas de suas avaliações" on public.evaluation_answers;
drop policy if exists "Establishment can read answers" on public.evaluation_answers;
create policy "Establishment can read answers"
  on public.evaluation_answers for select
  using (exists (
    select 1 from public.customer_evaluations e
    where e.id = evaluation_answers.evaluation_id and public.can_access_owner(e.user_id)
  ));

-- Correção 2: apagar um prêmio não pode mais apagar os cupons já emitidos.
-- prize_id era ON DELETE CASCADE: em 07/08/2026 22:41:42 UTC um DELETE em campaign_prizes
-- destruiu em silêncio cupons já entregues a clientes (ex.: VEQ-7916).
alter table public.campaign_prize_wins
  drop constraint campaign_prize_wins_prize_id_fkey;
alter table public.campaign_prize_wins
  add constraint campaign_prize_wins_prize_id_fkey
  foreign key (prize_id) references public.campaign_prizes(id) on delete restrict;
