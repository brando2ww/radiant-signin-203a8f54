-- Adiciona campos de WhatsApp à tabela de configurações de compras
ALTER TABLE public.pdv_purchase_settings
  ADD COLUMN IF NOT EXISTS whatsapp_enabled    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_send_mode  text    NOT NULL DEFAULT 'whatsapp_only',
  ADD COLUMN IF NOT EXISTS whatsapp_test_phone text;
