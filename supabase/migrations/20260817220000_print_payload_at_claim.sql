-- Monta a lista de itens da impressão NA HORA DE IMPRIMIR, não na hora de
-- enfileirar.
--
-- O problema: o pedido é gravado em três etapas (pedido → itens → opções dos
-- itens). O job de impressão nascia junto com o pedido e, quando caía no
-- intervalo entre gravar o item e gravar as opções, levava a lista de
-- complementos vazia. Aconteceu no pedido 002 do La Vecchia em 15/08: pedido
-- criado 19:34:49, job criado 19:34:50, e o Tortéi saiu na comanda sem
-- "Para 2 Pessoas" e sem "Alcatra a Parmegiana 500g".
--
-- Adiar o disparo só reduziria a chance. Montar no claim elimina a corrida:
-- quando o print-bridge reivindica o job, o pedido já está inteiro no banco.
--
-- Como as funções de claim devolvem a linha inteira de pdv_print_jobs, o
-- payload atualizado chega ao bridge sem nenhuma mudança nele — o que importa
-- porque há instalação em cliente com binário antigo.

-- ---------------------------------------------------------------------------
-- Construtor único dos itens. Mesma forma que enqueue_delivery_prints_sweep
-- produz, para o bridge não ver diferença entre os caminhos.
-- ---------------------------------------------------------------------------
create or replace function public.pdv_build_delivery_print_items(
  p_order_id uuid,
  p_center_id uuid,
  p_filter_by_center boolean
)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'product_name', oi.product_name,
        'quantity', oi.quantity,
        'notes', oi.notes,
        'modifiers', coalesce((
          select jsonb_agg(
                   jsonb_build_object(
                     'name', case when coalesce(op.quantity, 1) > 1
                                  then op.quantity::text || 'x ' || op.item_name
                                  else op.item_name end
                   )
                   order by op.option_name, op.item_name
                 )
            from public.delivery_order_item_options op
           where op.order_item_id = oi.id
             and op.item_name is not null
        ), '[]'::jsonb)
      )
      order by oi.id
    ),
    '[]'::jsonb
  )
  from public.delivery_order_items oi
  where oi.order_id = p_order_id
    -- Comanda do caixa leva o pedido inteiro; a via do centro de produção leva
    -- só os itens daquele centro.
    and (not p_filter_by_center or oi.production_center_id is not distinct from p_center_id);
$$;

comment on function public.pdv_build_delivery_print_items is
  'Itens de um pedido de delivery no formato do print-bridge. Chamado no claim para o payload refletir o pedido completo.';

-- ---------------------------------------------------------------------------
-- Claim em lote
-- ---------------------------------------------------------------------------
create or replace function public.print_bridge_claim_batch(
  p_tenant uuid,
  p_device text default null,
  p_limit integer default 10,
  p_max_age_minutes integer default 180,
  p_lease_seconds integer default 120,
  p_max_attempts integer default 6
)
returns setof pdv_print_jobs
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Job que esgotou as tentativas não pode ficar preso em printing para sempre.
  update public.pdv_print_jobs
     set status = 'failed',
         error_message = coalesce(last_attempt_error, error_message, 'tentativas esgotadas')
   where tenant_user_id = p_tenant
     and status = 'printing'
     and attempts >= p_max_attempts
     and claimed_at is not null
     and claimed_at < now() - make_interval(secs => p_lease_seconds);

  return query
  update public.pdv_print_jobs j
     set status     = 'printing',
         attempts   = j.attempts + 1,
         claimed_at = now(),
         claimed_by = p_device,
         -- Reconstrói só a chave 'items'; o resto do payload (cliente, endereço,
         -- totais, forma de pagamento) continua como foi enfileirado.
         payload    = case
           when j.source_item_id is not null
            and j.source_kind in ('delivery', 'comanda_caixa')
            and exists (select 1 from public.delivery_orders o where o.id = j.source_item_id)
           then jsonb_set(
                  j.payload,
                  '{items}',
                  public.pdv_build_delivery_print_items(
                    j.source_item_id,
                    j.center_id,
                    j.source_kind = 'delivery'
                  )
                )
           else j.payload
         end
   where j.id in (
     select c.id
       from public.pdv_print_jobs c
      where c.tenant_user_id = p_tenant
        and c.created_at > now() - make_interval(mins => p_max_age_minutes)
        and c.attempts < p_max_attempts
        and (
          c.status = 'pending'
          or (c.status = 'printing'
              and c.claimed_at is not null
              and c.claimed_at < now() - make_interval(secs => p_lease_seconds))
          or (c.status = 'printing'
              and c.claimed_at is null
              and c.created_at < now() - interval '10 minutes')
        )
      order by c.created_at
      limit greatest(1, least(p_limit, 50))
      for update skip locked
   )
  returning j.*;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Claim individual (reimpressão dirigida)
-- ---------------------------------------------------------------------------
create or replace function public.print_bridge_claim_one(
  p_job_id uuid,
  p_device text default null,
  p_max_attempts integer default 6
)
returns setof pdv_print_jobs
language sql
security definer
set search_path to 'public'
as $function$
  update public.pdv_print_jobs j
     set status     = 'printing',
         attempts   = j.attempts + 1,
         claimed_at = now(),
         claimed_by = p_device,
         payload    = case
           when j.source_item_id is not null
            and j.source_kind in ('delivery', 'comanda_caixa')
            and exists (select 1 from public.delivery_orders o where o.id = j.source_item_id)
           then jsonb_set(
                  j.payload,
                  '{items}',
                  public.pdv_build_delivery_print_items(
                    j.source_item_id,
                    j.center_id,
                    j.source_kind = 'delivery'
                  )
                )
           else j.payload
         end
   where j.id = p_job_id
     and j.status = 'pending'
     and j.attempts < p_max_attempts
  returning j.*;
$function$;
