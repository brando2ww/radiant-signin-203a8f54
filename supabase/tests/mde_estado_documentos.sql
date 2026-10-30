-- Executado somente pelo runner de relatórios em PostgreSQL descartável.
create table public.pdv_invoices (
  id integer primary key, source text, mde_nfe_completa boolean,
  mde_raw_payload jsonb, total_invoice numeric default 100, status text default 'pending'
);
insert into pdv_invoices(id, source, mde_nfe_completa, mde_raw_payload) values
  (1,'mde',null,'{"nfe_completa":true}'),
  (2,'mde',null,'{"nfe_completa":false}'),
  (3,'mde',false,'{"nfe_completa":true}'),
  (4,'mde',true,'{"nfe_completa":false}'),
  (5,'manual',null,'{"nfe_completa":true}'),
  (6,'mde',false,'{}'),
  (7,'mde',null,'{"nfe_completa":"true"}');
\ir ../migrations/20261026170000_mde_estado_documentos.sql
do $$ begin
  if exists (
    select 1 from pdv_invoices where mde_nfe_completa is distinct from
      case id when 1 then true when 2 then false when 3 then true when 4 then true
              when 5 then null when 6 then false when 7 then null end
  ) then raise exception 'Recuperação incorreta do estado de XML'; end if;
  raise notice 'OK: recupera XMLs completos sem rebaixar completos conhecidos ou alterar notas manuais';
  if (select sum(total_invoice) from pdv_invoices) <> 700
     or exists(select 1 from pdv_invoices where status <> 'pending') then
    raise exception 'Migração alterou valor ou status da nota';
  end if;
  raise notice 'OK: recuperação não altera valores nem status de entrada';
end $$;
\ir ../migrations/20261026170000_mde_estado_documentos.sql
do $$ begin
  if (select count(*) from pdv_invoices where mde_nfe_completa is true) <> 3 then
    raise exception 'Migração não é idempotente';
  end if;
  raise notice 'OK: recuperação pode ser repetida';
end $$;
