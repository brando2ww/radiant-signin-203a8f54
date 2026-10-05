-- Força de vendas · travas no banco (05/10/2026, revisão do líder depois do agente das propostas).
-- 1. O limite de desconto do representante e o preço de tabela do catálogo só eram conferidos na tela: chamando a API
--    direto, o representante podia vender abaixo da tabela ou com desconto acima do limite dele. Agora o banco recusa:
--    · item do catálogo com preço abaixo do preço de representante (ou de balcão, quando não há preço de representante);
--    · desconto do item acima do limite dele;
--    · desconto total da proposta (itens + desconto em reais) acima do limite, conferido ao enviar e ao virar pedido.
--    Dono, gerente e financeiro continuam livres.
-- 2. "Visto pelo cliente" era marcado por qualquer pessoa que abrisse o link, inclusive o vendedor logado. Agora só
--    conta quem não é da equipe do estabelecimento.

create or replace function public.vendas_fmt_pct(_v numeric)
returns text language sql immutable as $$
  select replace(rtrim(rtrim(round(_v, 2)::text, '0'), '.'), '.', ',') || '%'
$$;
create or replace function public.vendas_fmt_brl(_v numeric)
returns text language sql immutable as $$
  select 'R$ ' || replace(replace(replace(to_char(_v, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.')
$$;

create or replace function public.vendas_limite_desconto()
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce((select r.max_discount_percent from public.vendas_representantes r where r.id = public.vendas_rep_id()), 0)
$$;

create or replace function public.vendas_item_trava()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tabela numeric; v_limite numeric;
begin
  if not public.vendas_e_representante() then return new; end if;
  v_limite := public.vendas_limite_desconto();
  if new.discount_percent > v_limite then
    raise exception 'Desconto acima do seu limite (%).', public.vendas_fmt_pct(v_limite)
      using errcode = 'P0001', hint = 'desconto_acima_do_limite';
  end if;
  if new.product_id is not null then
    select coalesce(p.price_b2b, p.price_balcao, p.price_salon) into v_tabela from public.pdv_products p where p.id = new.product_id;
    if v_tabela is not null and new.unit_price < v_tabela then
      raise exception 'O preço do item não pode ficar abaixo do preço de tabela (%).', public.vendas_fmt_brl(v_tabela)
        using errcode = 'P0001', hint = 'preco_abaixo_da_tabela';
    end if;
  end if;
  return new;
end $$;
create trigger vendas_proposta_itens_trava before insert or update on public.vendas_proposta_itens
  for each row execute function public.vendas_item_trava();

-- Desconto total da proposta em % do valor cheio dos itens (preço × quantidade, sem desconto nenhum).
create or replace function public.vendas_desconto_total(_proposta uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case when coalesce(sum(i.quantity * i.unit_price), 0) = 0 then 0
              else round(100 * (sum(i.quantity * i.unit_price) - sum(i.total) + max(p.discount_amount)) / sum(i.quantity * i.unit_price), 2) end
    from public.vendas_propostas p left join public.vendas_proposta_itens i on i.proposta_id = p.id
   where p.id = _proposta
$$;

create or replace function public.vendas_conferir_desconto(_proposta uuid)
returns void language plpgsql stable security definer set search_path = public as $$
declare v_total numeric; v_limite numeric;
begin
  if not public.vendas_e_representante() then return; end if;
  v_limite := public.vendas_limite_desconto();
  v_total := public.vendas_desconto_total(_proposta);
  if v_total > v_limite + 0.01 then
    raise exception 'O desconto total da proposta (%) passa do seu limite (%). Peça a aprovação do gestor.',
      public.vendas_fmt_pct(v_total), public.vendas_fmt_pct(v_limite)
      using errcode = 'P0001', hint = 'desconto_acima_do_limite';
  end if;
end $$;

create or replace function public.vendas_proposta_trava()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'sent' and old.status is distinct from 'sent' then
    perform public.vendas_conferir_desconto(new.id);
  end if;
  return new;
end $$;
create trigger vendas_propostas_trava before update of status on public.vendas_propostas
  for each row execute function public.vendas_proposta_trava();

create or replace function public.vendas_converter_proposta(p_proposta uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare p public.vendas_propostas;
begin
  select * into p from public.vendas_propostas x where x.id = p_proposta;
  if p.id is null or not (public.vendas_gestor(p.user_id) or public.vendas_da_carteira(p.user_id, p.representative_id)) then
    raise exception 'Proposta não encontrada.' using errcode = 'P0001';
  end if;
  perform public.vendas_conferir_desconto(p.id);
  return public.vendas_gerar_pedido(p.id, null);
end $$;

create or replace function public.vendas_proposta_publica(p_token text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare p public.vendas_propostas;
begin
  select * into p from public.vendas_propostas x where x.public_token = p_token and x.status <> 'draft';
  if p.id is null then return null; end if;
  -- Só conta como "visto pelo cliente" quem não é da equipe do estabelecimento.
  if p.viewed_at is null and (auth.uid() is null or not (auth.uid() = p.user_id or public.is_establishment_member(p.user_id))) then
    update public.vendas_propostas x set viewed_at = now() where x.id = p.id;
  end if;
  if p.status = 'sent' and p.valid_until is not null and p.valid_until < (now() at time zone 'America/Sao_Paulo')::date then
    update public.vendas_propostas x set status = 'expired' where x.id = p.id;
    p.status := 'expired';
  end if;
  return jsonb_build_object(
    'proposta', jsonb_build_object('number', p.number, 'status', p.status, 'valid_until', p.valid_until, 'payment_method', p.payment_method,
      'installments', p.installments, 'first_due_days', p.first_due_days, 'interval_days', p.interval_days, 'payment_terms', p.payment_terms,
      'delivery_date', p.delivery_date, 'delivery_terms', p.delivery_terms, 'notes', p.notes, 'subtotal', p.subtotal,
      'discount_amount', p.discount_amount, 'shipping_amount', p.shipping_amount, 'total', p.total, 'created_at', p.created_at,
      'responded_at', p.responded_at, 'responder_name', p.responder_name, 'order_number', (select o.number from public.vendas_pedidos o where o.id = p.order_id)),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('description', i.description, 'image_url', i.image_url, 'unit', i.unit,
      'quantity', i.quantity, 'unit_price', i.unit_price, 'discount_percent', i.discount_percent, 'total', i.total) order by i.position)
      from public.vendas_proposta_itens i where i.proposta_id = p.id), '[]'),
    'cliente', (select jsonb_build_object('name', coalesce(c.trade_name, c.name), 'company_name', c.company_name,
      'document', coalesce(c.cnpj, c.cpf)) from public.pdv_customers c where c.id = p.customer_id),
    'representante', (select jsonb_build_object('name', r.name, 'phone', r.phone, 'email', r.email) from public.vendas_representantes r where r.id = p.representative_id),
    'marca', (select jsonb_build_object('name', coalesce(b.business_name, s.business_name), 'logo_url', b.logo_url, 'primary_color', b.primary_color,
      'secondary_color', b.secondary_color, 'cnpj', s.business_cnpj, 'phone', s.business_phone, 'address', s.business_address)
      from (select 1) one left join public.business_settings b on b.user_id = p.user_id left join public.pdv_settings s on s.user_id = p.user_id));
end $$;

notify pgrst, 'reload schema';
