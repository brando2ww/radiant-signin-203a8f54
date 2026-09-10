-- Resposta ao pedido de cancelamento do cliente (evento CANCELLATION_REQUESTED).
--
-- O iFood dá ~30 segundos para a loja aceitar ou negar. Não responder reprova a
-- homologação e, em produção, gera penalidade. A janela é menor que qualquer
-- tempo de reação humana, então a resposta é automática — mas o QUE responder
-- é decisão do estabelecimento, não do software.
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS ifood_auto_accept_cancellation boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pdv_settings.ifood_auto_accept_cancellation IS
  'true = aceita automaticamente o cancelamento pedido pelo cliente; false = nega. Padrão true: negar sem avaliar prende um cliente que já desistiu e gera disputa.';
