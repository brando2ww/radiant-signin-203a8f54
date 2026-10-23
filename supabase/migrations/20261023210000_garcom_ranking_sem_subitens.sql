-- "O que o garçom vê" listava "Meio 119.00" e "Meio 80.00" entre os mais
-- pedidos do Sertão Adentro (23/10/2026): o ranking somava também os
-- SUB-ITENS lançados pendurados num prato (tamanho, adicionais, partes de
-- combo). Esses não são lançados sozinhos pelo garçom; contam pelo prato.
--
-- Junto: a função é security definer e aceitava qualquer `_owner`, então
-- devolvia o ranking de vendas de qualquer loja para quem chamasse. Agora só
-- responde para o dono ou a equipe da própria loja.

create or replace function public.pdv_waiter_top_products(_owner uuid, _dias integer default 30, _limite integer default 20)
returns table (product_id uuid, product_name text, quantidade numeric, lancamentos bigint)
language sql
stable
security definer
set search_path = public
as $$
  select ci.product_id,
         max(ci.product_name) as product_name,
         sum(ci.quantity)     as quantidade,
         count(*)             as lancamentos
    from public.pdv_comanda_items ci
    join public.pdv_comandas c on c.id = ci.comanda_id
    join public.pdv_orders o   on o.id = c.order_id
   where o.user_id = _owner
     and _owner = (select public.pdv_resolve_owner(auth.uid()))
     and o.status in ('fechada', 'fechado')
     and c.created_at > now() - make_interval(days => greatest(1, coalesce(_dias, 30)))
     and ci.product_id is not null
     and ci.parent_item_id is null
   group by ci.product_id
   order by sum(ci.quantity) desc
   limit greatest(1, least(coalesce(_limite, 20), 100))
$$;
