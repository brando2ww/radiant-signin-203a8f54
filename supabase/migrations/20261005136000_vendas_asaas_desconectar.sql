-- Velara · Força de vendas · desconectar o Asaas do estabelecimento (05/10/2026).
--
-- A fundação grava a chave no cofre (vendas_asaas_gravar) mas não tem o caminho de volta. Ao desconectar, a chave de
-- uma conta de pagamento não deve ficar guardada sem uso: aqui ela sai do cofre e a linha volta a "disconnected".
-- O nome do segredo no cofre é único por estabelecimento ('vendas_asaas_<dono>'), então apagar o segredo junto é o que
-- deixa uma nova conexão criar outro com o mesmo nome. Só o servidor (chave de serviço) chama.

create or replace function public.vendas_asaas_desconectar(_owner uuid, _motivo text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_secret uuid;
begin
  select a.api_key_secret_id into v_secret from public.vendas_asaas a where a.user_id = _owner for update;
  if v_secret is not null then
    delete from vault.secrets s where s.id = v_secret;
  end if;
  update public.vendas_asaas a
     set api_key_secret_id = null, key_hint = null, webhook_id = null, status = 'disconnected',
         last_error = left(nullif(btrim(coalesce(_motivo, '')), ''), 300), updated_at = now()
   where a.user_id = _owner;
end $$;
revoke all on function public.vendas_asaas_desconectar(uuid, text) from public, anon, authenticated;
grant execute on function public.vendas_asaas_desconectar(uuid, text) to service_role;
