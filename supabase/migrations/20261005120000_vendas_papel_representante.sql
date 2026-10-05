-- Força de vendas (05/10/2026): papel novo de usuário do estabelecimento. Fica num arquivo próprio porque o Postgres só
-- deixa usar um valor novo de enum depois que ele foi gravado (a migration da fundação vem logo depois).
alter type public.app_role add value if not exists 'representante';
