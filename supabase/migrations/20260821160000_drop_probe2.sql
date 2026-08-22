-- Remove a sonda usada para confirmar que o caminho de sucesso da abertura
-- continuava íntegro depois de trocar RAISE por retorno de erro. Confirmou:
-- 140 itens, sem chave "error". O defeito estava no link copiado, não aqui.
drop function if exists public.pdv_sc_probe2();
delete from public.pdv_stock_count_links where label = '__p2__';
