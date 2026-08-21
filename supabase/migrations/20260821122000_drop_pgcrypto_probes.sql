-- Remove as sondas usadas para diagnosticar o schema do pgcrypto.
--
-- Ficou provado: com `search_path = public` a chamada morria em
-- "function gen_salt(unknown) does not exist"; com `public, extensions`
-- responde ok. As funções da contagem já foram corrigidas; as sondas não
-- servem mais e não devem ficar expostas a anon.
drop function if exists public.pdv_pgcrypto_probe();
drop function if exists public.pdv_pgcrypto_probe_public();
