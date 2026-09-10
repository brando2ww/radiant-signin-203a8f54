-- Códigos do catálogo passam a nascer em 900001.
--
-- Motivo: a numeração antiga começava em 1, e o cardápio que o lojista já tem
-- no iFood usa códigos numéricos curtos. Medido nos pedidos reais do Kōten
-- Garibaldi: "Sushi Mix 22 Peças" tem código 22 e "Combo Hot Cream Cheese" tem
-- 19 — ambos dentro da nossa faixa. Numa migração parcial do cardápio, um item
-- ainda não migrado casaria com OUTRO produto nosso de mesmo número, e a venda
-- entraria no produto errado sem nenhum erro aparecer.
--
-- A faixa 9xxxxx continua sendo só número (exigência do usuário) e é
-- reconhecível de olho: código da Velara começa com 9.
CREATE OR REPLACE FUNCTION public.proximo_codigo_catalogo(_user_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(COALESCE(MAX(code), 0) + 1, 900001)
  FROM public.delivery_catalog_codes
  WHERE user_id = _user_id;
$function$;

-- Renumera o que já foi gerado, preservando a ordem. Seguro agora porque
-- nenhum código nosso foi aplicado no iFood ainda: os códigos que chegaram nos
-- pedidos são os do próprio lojista (000294, 000415, 255...).
WITH novos AS (
  SELECT id, 900000 + ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY code) AS novo
  FROM public.delivery_catalog_codes
)
UPDATE public.delivery_catalog_codes c
SET code = n.novo
FROM novos n
WHERE n.id = c.id AND c.code <> n.novo;
