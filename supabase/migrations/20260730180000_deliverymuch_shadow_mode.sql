-- DeliveryMuch · modo sombra para a estreia em produção
--
-- Contexto: o ambiente de homologação da DeliveryMuch está fora do ar, então a
-- integração vai estrear direto em produção, com pedidos e dinheiro reais. A
-- primeira rodada precisa ser de observação pura.
--
-- Desenho: no modo sombra o pedido NÃO entra em delivery_orders. Ele é gravado
-- numa tabela de comparação, junto com a prévia do que teria sido criado. Isso
-- mantém a estreia completamente inerte:
--   · nada é impresso (o sweep de impressão nem enxerga esses registros)
--   · nada entra em relatório, caixa, estoque ou fidelidade
--   · nada é escrito na plataforma: sem aceite, sem cancelamento, sem auditoria
--   · a loja segue operando pelo Eugênio exatamente como hoje
--
-- A alternativa seria gravar em delivery_orders e travar a impressão por lá,
-- mas isso exigiria alterar enqueue_delivery_prints_sweep(), que é a função que
-- imprime as comandas do Koten hoje. Não vale arriscar a operação que funciona
-- para validar a que ainda não funciona.

ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS deliverymuch_shadow_mode boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pdv_settings.deliverymuch_shadow_mode IS
  'Enquanto true, a integração só observa: grava em deliverymuch_shadow_orders e não toca em delivery_orders nem na plataforma. Nasce ligado de propósito.';

CREATE TABLE IF NOT EXISTS public.deliverymuch_shadow_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  external_order_id text NOT NULL,
  external_code text,
  external_status text,
  external_stage text,
  -- payload cru: é com ele que os nomes de campo serão conferidos
  payload jsonb NOT NULL,
  -- como o pedido teria entrado no PDV, para comparar com o Eugênio lado a lado
  preview jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_order_id)
);

CREATE INDEX IF NOT EXISTS idx_deliverymuch_shadow_orders_recent
  ON public.deliverymuch_shadow_orders (user_id, first_seen_at DESC);

ALTER TABLE public.deliverymuch_shadow_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant lê seus pedidos em observação" ON public.deliverymuch_shadow_orders;
CREATE POLICY "Tenant lê seus pedidos em observação"
  ON public.deliverymuch_shadow_orders
  FOR SELECT
  USING (auth.uid() = user_id);
