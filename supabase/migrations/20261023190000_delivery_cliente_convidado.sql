-- Pedido sem cadastro no cardápio online: identificar o cliente pelo telefone
-- sem dar ao navegador acesso à tabela de clientes.
--
-- Até aqui a tela fazia select/update/insert direto em delivery_customers, o
-- que só funcionava porque a tabela estava aberta para leitura e alteração de
-- qualquer pessoa (vazamento de 23/10/2026). Esta função faz o mesmo no
-- servidor e devolve só o que a própria pessoa digitou, nunca o que já estava
-- gravado (quem sabe um telefone não pode descobrir o CPF de alguém).

create or replace function public.delivery_cliente_convidado(
  p_telefone text,
  p_nome text,
  p_documento text default null,
  p_tipo_documento text default 'CPF'
)
returns table (id uuid, name text, phone text, cpf text, document_type text)
language plpgsql
security definer
set search_path = public
as $$
-- id/name/phone/cpf são colunas da tabela E do retorno.
#variable_conflict use_column
declare
  v_tel text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_nome text := btrim(coalesce(p_nome, ''));
  v_doc text := nullif(regexp_replace(coalesce(p_documento, ''), '\D', '', 'g'), '');
  v_tipo text := case when upper(coalesce(p_tipo_documento, '')) = 'CNPJ' then 'CNPJ' else 'CPF' end;
  v_id uuid;
begin
  if length(v_tel) < 10 or length(v_tel) > 13 then
    raise exception 'Telefone inválido' using errcode = 'P0001';
  end if;
  if v_nome = '' then
    raise exception 'Informe o nome' using errcode = 'P0001';
  end if;

  -- Mesmo comportamento de antes (o nome digitado vale para aquele telefone),
  -- mas o CPF só muda quando a pessoa informa um.
  insert into delivery_customers as c (phone, name, cpf, document_type)
  values (v_tel, v_nome, v_doc, v_tipo)
  on conflict (phone) do update
    set name = excluded.name,
        cpf = coalesce(excluded.cpf, c.cpf),
        document_type = case when excluded.cpf is not null then excluded.document_type else c.document_type end,
        updated_at = now()
  returning c.id into v_id;

  return query select v_id, v_nome, v_tel, v_doc, v_tipo;
end;
$$;

revoke all on function public.delivery_cliente_convidado(text, text, text, text) from public;
grant execute on function public.delivery_cliente_convidado(text, text, text, text) to anon, authenticated;
