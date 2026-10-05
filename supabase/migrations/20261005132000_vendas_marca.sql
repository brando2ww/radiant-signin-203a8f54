-- Velara · Força de vendas · marca do estabelecimento para o PDF da proposta e do pedido (05/10/2026).
--
-- O PDF é gerado no navegador de quem está logado. O logo e a cor vêm de business_settings (leitura pública), mas o
-- CNPJ, o telefone e o endereço da empresa ficam em pdv_settings, que só o dono lê: o PDF baixado pelo representante
-- (ou pelo gerente) saía sem os dados da empresa. Esta função devolve só esses campos de vitrine, para o dono e a equipe.
-- Só acréscimo: nenhuma política de pdv_settings muda.

create or replace function public.vendas_marca(p_owner uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when auth.uid() = p_owner or public.is_establishment_member(p_owner) then
    (select jsonb_build_object(
       'name', coalesce(nullif(btrim(s.business_name), ''), b.business_name),
       'logo_url', b.logo_url,
       'primary_color', b.primary_color,
       'secondary_color', b.secondary_color,
       'cnpj', s.business_cnpj,
       'phone', s.business_phone,
       'address', s.business_address,
       'city', s.business_city,
       'state', s.business_state)
       from (select 1) one
       left join public.business_settings b on b.user_id = p_owner
       left join public.pdv_settings s on s.user_id = p_owner)
  end
$$;
revoke all on function public.vendas_marca(uuid) from public, anon;
grant execute on function public.vendas_marca(uuid) to authenticated;

notify pgrst, 'reload schema';
