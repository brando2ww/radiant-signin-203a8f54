# Corrigir registro de desconto/cupom e divergência item vs total

## Problema 1 — Bug crítico no banco

Existem duas versões da função `pdv_register_employee_consumption`:

- Antiga: `(p_employee_id, p_items, p_justification)` — sem suporte a desconto/cupom
- Nova: `(p_employee_id, p_items, p_justification, p_discount, p_discount_reason, p_coupon_code, p_notes)`

O PostgREST/Supabase resolve a sobrecarga pelo conjunto de argumentos enviados. Mesmo quando o frontend manda `p_discount`, `p_coupon_code`, etc., o roteamento pode acabar caindo na antiga em alguns clientes — e qualquer chamada legada continua persistindo `subtotal=0`, `discount=0`, `coupon_code=NULL`. Por isso desconto/cupom nunca aparecem no detalhe.

## Problema 2 — Divergência itens × total exibido

Entradas antigas (ex.: Isabeli 21/05) têm `total = 164,88` mas o JSON `items` soma R$ 229,00. Como `ConsumptionEntryDetails` calcula o subtotal a partir de `items` quando `subtotal = 0` e mostra `unit_price * quantity` por linha, o cliente vê uma "diferença" inexplicada de R$ 64,12 que não é desconto — é apenas o preço atual do combo diferindo do valor cobrado na época.

## Mudanças

### 1. Migração: remover a função antiga

```sql
DROP FUNCTION IF EXISTS public.pdv_register_employee_consumption(uuid, jsonb, text);
```

A nova versão (7 args, todos com DEFAULT) continua acessível para qualquer chamada — inclusive as que só passam os 3 primeiros argumentos.

### 2. `ConsumptionEntryDetails.tsx` — Honrar o subtotal salvo

Quando há divergência entre a soma dos `items` e o `subtotal` armazenado (caso típico de entradas antigas), exibir um aviso discreto e usar **sempre** o `subtotal/total` do banco como verdade financeira:

- Calcular `itemsSum = soma de unit_price * quantity`
- Se `Math.abs(itemsSum - subtotal) > 0.01` e não houver `discount`, renderizar uma linha extra abaixo do Subtotal:
  > `Ajuste (preço histórico)  − R$ 64,12`
  
  Texto curto explicando que o valor cobrado na época difere da soma atual dos itens. Sem cor de destaque, apenas `text-muted-foreground` e `text-xs`.
- Manter Total = `entry.total` (já vem do banco).

Isso elimina a impressão de "desconto fantasma" e mantém o histórico fiel.

### 3. Sem mudanças no fluxo de novo lançamento

O `EmployeeConsumptionFlowDialog` já envia corretamente `discount`, `coupon_code`, `discount_reason`, `notes`. Depois do DROP da função antiga, qualquer novo lançamento com desconto/cupom passará a persistir e aparecer no detalhe automaticamente.

## Validação

1. Após a migração, criar um lançamento de teste com cupom + desconto e abrir o card expandido — deve mostrar Cupom, Desconto, Motivo e Observação.
2. Abrir a entrada da Isabeli (21/05) — deve mostrar a linha "Ajuste (preço histórico)" em vez de causar dúvida sobre desconto.
