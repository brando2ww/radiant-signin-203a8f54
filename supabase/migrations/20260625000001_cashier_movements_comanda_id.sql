-- Adiciona comanda_id a pdv_cashier_movements para permitir reimpressão de recibos
ALTER TABLE pdv_cashier_movements
  ADD COLUMN IF NOT EXISTS comanda_id UUID REFERENCES pdv_comandas(id) ON DELETE SET NULL;
