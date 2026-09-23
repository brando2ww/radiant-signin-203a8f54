-- Dados da venda original, para o terminal conseguir estornar.
--
-- O estorno pela maquininha exige o CV, o valor e a data da transação original
-- (e só vale no mesmo dia, pela documentação da Getnet). O app conhece o pedido
-- de cancelamento, não a venda que ele desfaz: esta função faz essa ponte.
create or replace function public.tef_terminal_venda_original(
  p_tenant uuid,
  p_request_id uuid
) returns jsonb
language sql security definer set search_path = public
as $$
  select coalesce(
    (select jsonb_build_object(
              'valor', r.amount,
              'quando', r.finished_at,
              'cv', r.result->>'cv',
              'nsu', r.result->>'nsu',
              'terminal_origem', r.result->>'numero_logico'
            )
       from public.pdv_tef_requests r
      where r.id = p_request_id and r.tenant_user_id = p_tenant and r.status = 'approved'),
    '{}'::jsonb);
$$;

grant execute on function public.tef_terminal_venda_original(uuid, uuid) to anon, authenticated;
