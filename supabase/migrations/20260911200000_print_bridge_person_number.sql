-- "Pessoas N" no cabeçalho da comanda de mesa.
--
-- O número de pessoas já era gravado em pdv_comandas.person_number desde a
-- abertura da mesa, mas nunca chegava na impressão: a view que alimenta o
-- print-bridge não expunha a coluna. Sem ela a comanda de salão não tem como
-- imprimir o "Pessoas 8" que o salão usa para conferir o rodízio por cabeça.

CREATE OR REPLACE VIEW vw_print_bridge_comanda_items AS
 SELECT ci.id,
    ci.comanda_id,
    ci.production_center_id,
    ci.product_name,
    ci.quantity,
    ci.notes,
    ci.modifiers,
    ci.kitchen_status,
    ci.sent_to_kitchen_at,
    ci.parent_item_id,
    ci.is_composite_child,
    ci.composition_group_label,
    ci.composition_position,
    parent.product_name AS parent_product_name,
    pc.name AS center_name,
    pc.printer_ip,
    pc.printer_port,
    c.comanda_number,
    c.customer_name,
    c.user_id AS tenant_user_id,
    o.id AS order_id,
    o.order_number,
    o.table_id,
    t.table_number,
    COALESCE(t.is_virtual, false) AS is_virtual,
    -- Coluna nova vai no fim: CREATE OR REPLACE VIEW não permite inserir no
    -- meio da lista sem derrubar e recriar a view (e as permissões dela).
    c.person_number
   FROM pdv_comanda_items ci
     JOIN pdv_comandas c ON c.id = ci.comanda_id
     LEFT JOIN pdv_orders o ON o.id = c.order_id
     LEFT JOIN pdv_tables t ON t.id = o.table_id
     LEFT JOIN pdv_production_centers pc ON pc.id = ci.production_center_id
     LEFT JOIN pdv_comanda_items parent ON parent.id = ci.parent_item_id;
