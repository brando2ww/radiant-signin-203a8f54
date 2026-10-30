-- A equipe lê os parâmetros do caixa do estabelecimento, sem receber segredos fiscais.
begin;
create or replace function public.pdv_settings_operacionais(p_owner uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  if not public.pdv_cashback_pode(p_owner) then raise exception 'Estabelecimento não autorizado' using errcode='42501'; end if;
  select jsonb_object_agg(e.key,e.value) into result
  from public.pdv_settings s cross join lateral jsonb_each(to_jsonb(s)) e
  where s.user_id=p_owner and e.key=any(array[
    'id','user_id','salon_layout','shifts','auto_print_to_kitchen','require_customer_identification',
    'enable_service_fee','service_fee_percentage','requires_opening_balance','allow_negative_balance',
    'integrate_with_delivery','business_name','business_phone','business_address','business_cnpj',
    'state_registration','tax_regime','business_hours','default_preparation_time','accept_tips',
    'min_order_value','max_tables_per_order','accepted_payment_methods','delivery_fee','enable_multiple_payments',
    'enable_sound_notifications','new_order_sound','order_ready_sound','enable_desktop_notifications',
    'nfe_enable_nfce','nfe_auto_emit','nfe_ambiente','nfe_incluir_taxa_servico','require_discount_reason',
    'cashback_ativo','cashback_percentual','cashback_validade_dias','counter_table_name','created_at','updated_at'
  ]);
  return result;
end $$;
revoke all on function public.pdv_settings_operacionais(uuid) from public,anon;
grant execute on function public.pdv_settings_operacionais(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
