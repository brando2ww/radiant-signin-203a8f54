-- Corrige o search_path das funções da contagem que usam pgcrypto.
--
-- No Supabase, pgcrypto é instalado no schema `extensions`, não em `public`.
-- As funções foram criadas com `set search_path = public`, então `crypt()` e
-- `gen_salt()` ficavam invisíveis e a abertura da contagem morria com
-- "function gen_salt(unknown) does not exist" — que a tela traduzia para o
-- genérico "Não foi possível concluir".
--
-- `create extension if not exists pgcrypto` não ajudou porque a extensão já
-- existia: o comando não a move de schema.
--
-- Incluir os dois schemas funciona nos dois cenários, e não depende de onde a
-- extensão está hoje.

-- Sonda temporária: confirma se crypt/gen_salt são alcançáveis com o
-- search_path corrigido. Removida no fim desta migration.
create or replace function public.pdv_pgcrypto_probe()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform crypt('teste', gen_salt('bf'));
  return 'ok';
exception when others then
  return 'falhou: ' || sqlerrm;
end;
$$;

grant execute on function public.pdv_pgcrypto_probe() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- As duas funções que usam pgcrypto passam a enxergar `extensions`
-- ---------------------------------------------------------------------------

alter function public.pdv_stock_count_create(text, jsonb, text[], text[], boolean, int)
  set search_path = public, extensions;

alter function public.pdv_stock_count_open(uuid, text, text)
  set search_path = public, extensions;
