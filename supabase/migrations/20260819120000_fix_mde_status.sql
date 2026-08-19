-- Corrige o status de manifesto das notas recebidas.
--
-- A consulta MDe usava `note.situacao` como fallback quando o Focus não
-- devolvia `situacao_manifesto`. Só que `situacao` é o estado da NOTA
-- (autorizada, cancelada), não do manifesto. O resultado é que praticamente
-- toda nota ficou com mde_status = 'autorizada':
--
--   * os filtros da tela (Pendente / Ciência emitida / Confirmado) não casavam
--     com nada, e apareciam sempre vazios;
--   * não dava para saber quais notas ainda precisavam de ciência, que é
--     justamente o que libera o XML completo para dar entrada.
--
-- Quem tem status de nota gravado no campo errado volta para 'pendente', que é
-- a verdade: nenhuma ciência foi registrada por aqui.

update public.pdv_invoices
   set mde_status = 'pendente'
 where source = 'mde'
   and mde_status is not null
   and mde_status not in ('pendente', 'ciencia', 'confirmado', 'desconhecido', 'nao_realizado');

-- Notas do MDe sem status nenhum também são pendentes de manifesto.
update public.pdv_invoices
   set mde_status = 'pendente'
 where source = 'mde'
   and mde_status is null;
