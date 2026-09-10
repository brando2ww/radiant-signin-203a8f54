-- Cidade e UF no cadastro GERAL do estabelecimento.
--
-- A variável {{4}} do modelo de cotação do WhatsApp é a cidade, e até aqui ela
-- só existia dentro de `nfe_endereco_fiscal` — ou seja, atrás do módulo fiscal,
-- que exige certificado digital A1 para ser preenchido.
--
-- Consequência: um lojista que ainda não emite nota fiscal não conseguia
-- disparar cotação por WhatsApp, porque não tinha como informar a cidade. Um
-- dado de compras ficava refém de uma configuração de NF-e.
--
-- `business_address` já existe, mas é texto livre ("Rua 14 de Julho, 741 -
-- Centro"), sem cidade separável de forma confiável.
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS business_city text,
  ADD COLUMN IF NOT EXISTS business_state text;

COMMENT ON COLUMN public.pdv_settings.business_city IS
  'Cidade do estabelecimento, no cadastro geral. Independe do módulo fiscal: alimenta a cotação por WhatsApp, que a Meta recusa inteira se a variável vier vazia.';
