-- Emissão de NFC-e no PDV e no Delivery — fundação.
--
-- Três problemas de schema impediam qualquer nota de sair:
--   1. `delivery_settings.nfce_auto_emit` era lida pelo frontend mas nunca existiu,
--      então a auto-emissão do delivery jamais disparava e o toggle da tela de
--      configurações falhava ao salvar.
--   2. `notas_fiscais` não guardava o QR Code devolvido pela Focus, que é
--      obrigatório no DANFE NFC-e impresso.
--   3. Buscar a nota de um pedido (origem_tipo/origem_id) não tinha índice.

-- 1. Auto-emissão no delivery
ALTER TABLE public.delivery_settings
  ADD COLUMN IF NOT EXISTS nfce_auto_emit boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.delivery_settings.nfce_auto_emit IS
  'Emite NFC-e automaticamente quando o pedido de delivery é concluído e pago.';

-- 2. QR Code e URL de consulta da NFC-e (Focus devolve ambos na autorização)
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS qrcode text,
  ADD COLUMN IF NOT EXISTS url_consulta text;

COMMENT ON COLUMN public.notas_fiscais.qrcode IS
  'Conteúdo do QR Code da NFC-e (URL completa), impresso no DANFE.';

-- 3. Vínculo nota <-> venda de origem (comanda, mesa, pedido de delivery)
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_origem
  ON public.notas_fiscais (origem_tipo, origem_id)
  WHERE origem_id IS NOT NULL;

-- 4. Taxa de serviço na nota.
-- A gorjeta facultativa de 10% não compõe a base da NFC-e no entendimento mais
-- comum; fica desligada por padrão e cabe à contabilidade de cada cliente ligar.
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS nfe_incluir_taxa_servico boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pdv_settings.nfe_incluir_taxa_servico IS
  'Inclui a taxa de serviço na NFC-e como outras despesas acessórias. Confirmar com a contabilidade.';

-- 5. O print-bridge precisa aceitar jobs de DANFE.
-- O CHECK de `source_kind` hoje aceita comanda/order/delivery/comanda_caixa.
ALTER TABLE public.pdv_print_jobs
  DROP CONSTRAINT IF EXISTS pdv_print_jobs_source_kind_check;

ALTER TABLE public.pdv_print_jobs
  ADD CONSTRAINT pdv_print_jobs_source_kind_check
  CHECK (source_kind IN ('comanda', 'order', 'delivery', 'comanda_caixa', 'danfe'));

-- Uma nota imprime uma vez. Várias abas do PDV recebem o mesmo evento e
-- tentariam enfileirar o mesmo cupom em paralelo — mesmo motivo dos índices
-- equivalentes de `delivery` e `comanda_caixa`. Reimpressão manual grava
-- source_item_id NULL e escapa do índice de propósito.
CREATE UNIQUE INDEX IF NOT EXISTS pdv_print_jobs_danfe_nota_center_uniq
  ON public.pdv_print_jobs (source_item_id, center_id)
  WHERE source_kind = 'danfe' AND source_item_id IS NOT NULL;
