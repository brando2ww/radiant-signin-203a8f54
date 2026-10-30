-- Preserva no cadastro de clientes somente contatos com nome e telefone válido.
-- A importação é repetível e não altera datas/status das comandas nem gera cashback retroativo.
begin;

create table if not exists public.pdv_clientes_comandas (
  comanda_id uuid primary key references public.pdv_comandas(id) on delete cascade,
  customer_id uuid not null references public.pdv_customers(id) on delete cascade
);
create index if not exists pdv_clientes_comandas_customer on public.pdv_clientes_comandas(customer_id);
alter table public.pdv_clientes_comandas enable row level security;
revoke all on public.pdv_clientes_comandas from public, anon, authenticated;
grant all on public.pdv_clientes_comandas to service_role;

create index if not exists pdv_customers_telefone_normalizado
  on public.pdv_customers(user_id, public.pdv_telefone_normalizado(phone));

create or replace function public.pdv_preservar_contato_cliente(
  p_owner uuid, p_nome text, p_telefone text, p_criado_em timestamptz
)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v_tel text := public.pdv_telefone_normalizado(p_telefone);
  v_cliente uuid;
begin
  -- Rótulos operacionais como "Mesa 4" e "Pessoa 1" não identificam um cliente.
  if v_nome ~* '^(mesa|comanda|pessoa|cliente|balc[aã]o|consumidor|avulsa?)\s*#?\s*[0-9-]*\s*$' then
    v_nome := null;
  end if;
  if v_nome is null or v_tel is null then return null; end if;

  -- Duas comandas abertas simultaneamente com o mesmo telefone devem usar o mesmo cadastro.
  perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || v_tel, 0));
  select id into v_cliente from public.pdv_customers
   where user_id = p_owner and public.pdv_telefone_normalizado(phone) = v_tel
   order by created_at, id limit 1;

  if v_cliente is null then
    insert into public.pdv_customers(user_id, name, phone, created_at)
    values (p_owner, v_nome, v_tel, coalesce(p_criado_em, now()))
    returning id into v_cliente;
  else
    -- Completa campos vazios; não sobrescreve dados cadastrados pela loja.
    update public.pdv_customers c
       set name = v_nome
     where c.id = v_cliente
       and (nullif(btrim(c.name), '') is null or c.name = 'Cliente ' || coalesce(c.phone, ''));
  end if;

  return v_cliente;
end $$;
revoke all on function public.pdv_preservar_contato_cliente(uuid, text, text, timestamptz) from public, anon, authenticated;

create or replace function public.pdv_cliente_da_comanda(p_comanda public.pdv_comandas)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_cliente uuid;
begin
  v_cliente := public.pdv_preservar_contato_cliente(p_comanda.user_id, p_comanda.customer_name,
    p_comanda.customer_phone, p_comanda.created_at);
  if v_cliente is null then return null; end if;
  insert into public.pdv_clientes_comandas(comanda_id, customer_id)
  values (p_comanda.id, v_cliente)
  on conflict (comanda_id) do update set customer_id = excluded.customer_id;
  return v_cliente;
end $$;
revoke all on function public.pdv_cliente_da_comanda(public.pdv_comandas) from public, anon, authenticated;

create or replace function public.pdv_sincronizar_cliente_comanda()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.pdv_cliente_da_comanda(new);
  return new;
end $$;
revoke all on function public.pdv_sincronizar_cliente_comanda() from public, anon, authenticated;
drop trigger if exists pdv_comanda_salvar_cliente on public.pdv_comandas;
create trigger pdv_comanda_salvar_cliente
  after insert or update of customer_name, customer_phone on public.pdv_comandas
  for each row execute function public.pdv_sincronizar_cliente_comanda();

-- Quem preencheu seus próprios dados ao entrar numa comanda compartilhada pelo QR
-- pode ter ficado somente na sessão. Também preserva esses contatos, sem trocar o
-- titular da comanda nem transferir o cashback de uma pessoa para outra.
create or replace function public.pdv_sincronizar_cliente_sessao_mesa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.pdv_telefone_normalizado(new.celular) is not null then
    perform public.pdv_preservar_contato_cliente(new.user_id, new.nome, new.celular, new.criada_em);
  end if;
  return new;
end $$;
revoke all on function public.pdv_sincronizar_cliente_sessao_mesa() from public, anon, authenticated;
drop trigger if exists pdv_mesa_sessao_salvar_cliente on public.mesa_sessoes;
create trigger pdv_mesa_sessao_salvar_cliente
  after insert or update of nome, celular on public.mesa_sessoes
  for each row execute function public.pdv_sincronizar_cliente_sessao_mesa();

-- Importa o histórico com nome E telefone, mesmo com cashback desligado, sem tocar nas comandas.
do $$
declare
  v_comanda public.pdv_comandas;
  v_sessao public.mesa_sessoes;
  v_antes bigint;
  v_total bigint;
begin
  select count(*) into v_antes from public.pdv_customers;
  for v_comanda in
    select * from public.pdv_comandas
     where nullif(btrim(customer_name), '') is not null and public.pdv_telefone_normalizado(customer_phone) is not null
     order by created_at, id
  loop
    perform public.pdv_cliente_da_comanda(v_comanda);
  end loop;
  for v_sessao in
    select * from public.mesa_sessoes
     where nullif(btrim(nome), '') is not null and public.pdv_telefone_normalizado(celular) is not null
     order by criada_em, id
  loop
    perform public.pdv_preservar_contato_cliente(v_sessao.user_id, v_sessao.nome,
      v_sessao.celular, v_sessao.criada_em);
  end loop;
  select count(*) - v_antes into v_total from public.pdv_customers;
  raise notice 'Clientes importados das comandas: %', v_total;
end $$;

-- A equipe que recebe o cliente também precisa enxergar o cadastro.
drop policy if exists pdv_clientes_leitura_equipe on public.pdv_customers;
create policy pdv_clientes_leitura_equipe on public.pdv_customers for select to authenticated
  using (user_id = (select auth.uid()) or public.is_establishment_member(user_id));

-- O mesmo saldo utilizável no caixa, isolado por loja e agregado no servidor.
create or replace function public.pdv_clientes_cashback(p_owner uuid)
returns table(telefone text, saldo numeric, vence_em date)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pdv_cashback_pode(p_owner) then
    raise exception 'Sem permissão para ver o cashback desta loja' using errcode = '42501';
  end if;
  return query
    select cr.telefone, sum(cr.restante), min(cr.vence_em)
      from public.pdv_cashback_creditos cr
     where cr.user_id = p_owner and cr.restante > 0
       and cr.vence_em >= (now() at time zone 'America/Sao_Paulo')::date
       and exists (select 1 from public.pdv_settings s where s.user_id = p_owner and s.cashback_ativo)
     group by cr.telefone;
end $$;
revoke all on function public.pdv_clientes_cashback(uuid) from public, anon;
grant execute on function public.pdv_clientes_cashback(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
