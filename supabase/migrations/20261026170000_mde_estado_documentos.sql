-- A varredura guardava nfe_completa no payload mas não na coluna usada pela tela.
-- Recupera apenas informação já recebida; não manifesta notas, lança estoque ou financeiro.
begin;
update public.pdv_invoices
   set mde_nfe_completa = coalesce(mde_nfe_completa, false) or mde_raw_payload->>'nfe_completa' = 'true'
 where source = 'mde'
   and jsonb_typeof(mde_raw_payload->'nfe_completa') = 'boolean'
   and (mde_nfe_completa is null or (mde_nfe_completa is false and mde_raw_payload->>'nfe_completa' = 'true'));
commit;
