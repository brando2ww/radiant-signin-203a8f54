-- Mesa Digital · o estado da comanda devolve também o número dela (20/10/2026), para a tela mostrar
-- "Mesa 03 · Comanda 002" agora que a mesa pode ter várias comandas pelo QR. Igual à definição em produção, mais o campo.

CREATE OR REPLACE FUNCTION public.mesa_estado(p_sessao uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_s record; v_c record; v_taxa numeric; v_ps record; v_cfg record;
begin
  select * into v_s from mesa_sessao_valida(p_sessao);
  if v_s.id is null then return jsonb_build_object('error', 'sessao_invalida'); end if;

  select id, status, subtotal, comanda_number into v_c from pdv_comandas where id = v_s.comanda_id;
  select enable_service_fee, service_fee_percentage into v_ps from pdv_settings where user_id = v_s.user_id limit 1;
  select mostrar_taxa_servico into v_cfg from mesa_config where user_id = v_s.user_id;
  v_taxa := case when coalesce(v_cfg.mostrar_taxa_servico, true) and coalesce(v_ps.enable_service_fee, false)
                 then round(coalesce(v_c.subtotal, 0) * coalesce(v_ps.service_fee_percentage, 10) / 100, 2) else 0 end;

  return jsonb_build_object(
    'status', v_s.status,
    'nome', v_s.nome,
    'mesa', (select table_number from pdv_tables where id = v_s.table_id),
    'comanda_status', v_c.status,
    'comanda_numero', v_c.comanda_number,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', i.id, 'nome', i.product_name, 'quantidade', i.quantity, 'preco', i.unit_price,
                'subtotal', i.subtotal, 'obs', i.notes, 'enviado', i.sent_to_kitchen_at is not null,
                'pelo_qr', i.origem = 'qr', 'hora', i.created_at,
                'subitens', (select coalesce(jsonb_agg(f.product_name order by f.composition_position), '[]'::jsonb)
                               from pdv_comanda_items f where f.parent_item_id = i.id))
                order by i.created_at), '[]'::jsonb)
                from pdv_comanda_items i where i.comanda_id = v_s.comanda_id and i.parent_item_id is null),
    'subtotal', coalesce(v_c.subtotal, 0),
    'taxa_servico', v_taxa,
    'total', coalesce(v_c.subtotal, 0) + v_taxa,
    'chamado_aberto', exists (select 1 from mesa_chamados where table_id = v_s.table_id and status = 'aberto' and tipo = 'garcom'),
    'conta_pedida', v_s.status = 'conta_pedida' or v_c.status in ('aguardando_pagamento', 'em_cobranca'));
end $function$;
