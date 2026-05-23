## Objetivo

Hoje a Venda a Prazo mostra apenas "X item(s)" e o total. Vamos:
1. Mostrar a lista detalhada dos produtos consumidos em cada lançamento.
2. Permitir registrar **desconto / cupom** no momento do lançamento e exibi-lo no extrato.
3. Mostrar **quem lançou** (operador) e **observações**.

## Banco (1 migração)

Tabela `pdv_employee_consumption_entries`:
- Adicionar colunas:
  - `subtotal numeric NOT NULL DEFAULT 0` (soma dos itens antes do desconto)
  - `discount numeric NOT NULL DEFAULT 0`
  - `discount_reason text` (motivo do desconto)
  - `coupon_code text` (código do cupom usado, opcional)
  - `notes text` (observação livre do operador)
- Backfill: `UPDATE ... SET subtotal = total` nas linhas existentes.

Atualizar a função `pdv_register_employee_consumption(p_employee_id, p_items, p_justification, p_discount, p_discount_reason, p_coupon_code, p_notes)`:
- Calcular `v_subtotal` a partir dos itens.
- `v_total = GREATEST(0, v_subtotal - COALESCE(p_discount, 0))`.
- Validar limite usando o `v_total` final (pós-desconto).
- Persistir os novos campos no INSERT.
- Manter compatibilidade: parâmetros novos com `DEFAULT NULL/0`.

## Frontend

### `EmployeeConsumptionFlowDialog.tsx` (step "products")
- Acima do botão Confirmar, adicionar bloco "Desconto / Cupom":
  - Input `Cupom (opcional)` — texto livre (vai como `coupon_code`).
  - `CurrencyInput` "Desconto (R$)" — limitado ao `cartTotal`.
  - Input `Motivo do desconto` (obrigatório se desconto > 0, mín. 3 chars).
  - Textarea `Observação` (opcional).
- Painel de totais: mostrar Subtotal, Desconto, Total final, Saldo atual, Novo saldo (recalculado com o desconto).
- `handleConfirmConsume` envia `discount`, `discount_reason`, `coupon_code`, `notes` para a RPC.

### `use-employee-consumption.ts`
- Estender `ConsumptionEntry` com `subtotal`, `discount`, `discount_reason`, `coupon_code`, `notes`, `operator_id`.
- `registerConsumption` aceita os novos campos opcionais e os envia na RPC.

### `EmployeeStatementSheet.tsx` (Extrato)
- Cada card de "Consumo" passa a ser expansível (acordeão simples com chevron):
  - Lista de itens: `Produto — qtd x unit = subtotal` (usando `formatBRL`).
  - Linha "Subtotal", "Desconto −R$ …" (se `discount > 0`), "Cupom: CÓDIGO" (se houver), "Total".
  - Linha "Lançado por: Nome" — buscar do hook `usePDVUsers` pelo `operator_id` (fallback "—").
  - Linha "Motivo do desconto" e "Observação" quando preenchidos.
  - Linha "Justificativa de limite" quando `over_limit_justification` existir.
- Quitação continua compacta.

### `EmployeeConsumptionAdmin.tsx` (aba Lançamentos)
- Cada linha vira expansível mostrando o mesmo bloco de detalhes (produtos, descontos, cupom, operador, observação).
- Exportação CSV: adicionar colunas `Subtotal`, `Desconto`, `Cupom`, `Operador`, `Observação`, e uma coluna `Itens` concatenando `qtd x nome` separado por `|`.

### `SettlementEntries` (dentro do flow dialog)
- Continua compacto, mas exibe o `formatBRL(total)` original e, se houve desconto, um pequeno texto `c/ desconto`.

## Pontos de atenção

- Manter as cores semânticas do design system (sem cores customizadas).
- Datas com `format(..., { locale: ptBR })`.
- Valores sempre via `formatBRL`.
- A migração precisa preservar lançamentos antigos (backfill `subtotal = total`, `discount = 0`).
- Não alterar nenhum outro fluxo (PDV normal, comandas, delivery).
