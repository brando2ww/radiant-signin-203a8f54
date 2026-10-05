-- Velara · Força de vendas · cliente repetido pelo CNPJ/CPF (05/10/2026).
--
-- O representante só enxerga a carteira dele, então a tela de cadastro não tinha como saber que o CNPJ já é cliente
-- de outro representante (ou da gestão) e cadastrava de novo, criando o mesmo cliente em duas carteiras.
-- Esta função responde se o documento já existe no estabelecimento de quem pergunta. Para o representante, o nome só
-- volta quando o cliente é da carteira dele; fora dela, só "já existe".
-- Só acréscimo: nenhuma tabela, política ou função existente muda.

create or replace function public.vendas_cliente_documento(p_documento text, p_ignorar uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_owner uuid := public.pdv_resolve_owner(auth.uid());
  v_doc text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  c public.pdv_customers;
begin
  if auth.uid() is null or length(v_doc) not in (11, 14) then return null; end if;
  if not (auth.uid() = v_owner or public.is_establishment_member(v_owner)) then return null; end if;
  select * into c from public.pdv_customers x
   where x.user_id = v_owner
     and (p_ignorar is null or x.id <> p_ignorar)
     and (regexp_replace(coalesce(x.cnpj, ''), '\D', '', 'g') = v_doc
          or regexp_replace(coalesce(x.cpf, ''), '\D', '', 'g') = v_doc)
   order by x.created_at
   limit 1;
  if c.id is null then return null; end if;
  if public.vendas_e_representante() and c.representative_id is distinct from public.vendas_rep_id() then
    return jsonb_build_object('existe', true, 'visivel', false);
  end if;
  return jsonb_build_object('existe', true, 'visivel', true, 'id', c.id, 'name', c.name);
end $$;

revoke all on function public.vendas_cliente_documento(text, uuid) from public, anon;
grant execute on function public.vendas_cliente_documento(text, uuid) to authenticated;

notify pgrst, 'reload schema';
