-- Excluir uma contagem de estoque.
--
-- O caso comum é banal: abriram sem querer e querem limpar. Mas há um caso em
-- que apagar é destrutivo de verdade — a contagem JÁ APLICADA. Ao aplicar, os
-- saldos dos insumos foram corrigidos e nasceram movimentos de estoque do tipo
-- ajuste; esses movimentos guardam só o nome da contagem no `reason`, não uma
-- referência. Apagar a contagem deixaria o ajuste no estoque sem nada que
-- explique de onde veio.
--
-- Por isso: contagem aplicada não é excluída, é cancelada. O resto vai embora
-- por cascata (links, itens, sessões já têm ON DELETE CASCADE).

create or replace function public.pdv_stock_count_delete(_count_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_owner uuid;
  v_count record;
  v_contados int;
begin
  if auth.uid() is null then
    raise exception 'authentication_required';
  end if;
  v_owner := public.pdv_resolve_owner(auth.uid());

  select * into v_count
    from public.pdv_stock_counts
   where id = _count_id and user_id = v_owner
   for update;
  if not found then
    raise exception 'count_not_found';
  end if;

  if v_count.status = 'aplicada' then
    -- Apagar aqui apagaria a explicação de um ajuste que já mexeu no estoque.
    raise exception 'count_already_applied';
  end if;

  select count(*) into v_contados
    from public.pdv_stock_count_items
   where count_id = _count_id and counted_qty is not null;

  delete from public.pdv_stock_counts where id = _count_id;

  return jsonb_build_object('deleted', true, 'counted_items', v_contados);
end;
$$;

grant execute on function public.pdv_stock_count_delete(uuid) to authenticated;
