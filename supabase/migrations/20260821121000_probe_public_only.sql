-- Sonda de controle: mesmo teste, mas com search_path só em public. Serve para
-- provar que a causa era o schema do pgcrypto, e não outra coisa.
create or replace function public.pdv_pgcrypto_probe_public()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform crypt('teste', gen_salt('bf'));
  return 'ok';
exception when others then
  return 'falhou: ' || sqlerrm;
end;
$$;
grant execute on function public.pdv_pgcrypto_probe_public() to anon, authenticated;
