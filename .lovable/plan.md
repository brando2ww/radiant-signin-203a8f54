## Objetivo

Mudar a regra de bloqueio do botão "Confirmar Fechamento" no `CloseCashierDialog` para considerar **somente a diferença total final** (Total apurado pelo operador − Total esperado pelo sistema), e tratar divergências entre formas de pagamento que se compensam como apenas informativas.

## Cenário hoje (bug)

`hasAnyDifference = rowsWithDiff.length > 0 || hasTotalDiff` exige justificativa sempre que QUALQUER linha individual diverge — mesmo quando o total fecha em R$ 0,00. Por isso o exemplo (dinheiro −25, débito +10, vale +15, total = 0) está bloqueado.

## Mudanças no `src/components/pdv/CloseCashierDialog.tsx`

### 1. Lógica de bloqueio (linhas ~515–532)

- `requiresJustification = hasTotalDiff` (apenas o total final dispara obrigatoriedade).
- `hasReconciledMismatch = rowsWithDiff.length > 0 && !hasTotalDiff` (compensação entre formas).
- `justificationOk = !requiresJustification || justificationValid`.
- Remover `isBlocked` baseado em `cashRiskLevel === "critical"` (passa a depender apenas do total final; o "risco" continua sendo registrado para auditoria mas não bloqueia).
- `canClose`: exige `declaredCash` preenchido, `declaredTotal` preenchido e `justificationOk`.

### 2. `closingStatus` (4 estados conforme pedido)

```
no_difference            → totalDiff == 0 e nenhuma linha diverge
reconciled_with_mismatch → totalDiff == 0 e alguma linha diverge (NOVO)
surplus                  → totalDiff > 0
shortage                 → totalDiff < 0
```

### 3. UI

- **Seção 4 "Diferenças encontradas"**: quando `hasReconciledMismatch && !hasTotalDiff`, mostrar banner amarelo/laranja suave (não bloqueante) com:
  - Título: "Divergência entre formas de pagamento"
  - Texto: "O total final do caixa está correto, mas existem diferenças entre os meios de pagamento. Isso pode ocorrer por troca de forma de pagamento, lançamento incorreto ou ajuste operacional."
  - Continuar listando as diferenças individuais como informativo.
- **Seção 5 "Justificativa"**: só renderiza quando `requiresJustification` (totalDiff ≠ 0). No caso reconciliado, justificativa fica opcional num campo separado dentro de "Observações" (que já existe).
- **Card de risco do dinheiro** (linhas 793–812): manter como informativo, sem bloquear.
- **Confirmação extra (`confirmOpen`)**: abrir o `AlertDialog` apenas quando `hasTotalDiff` (sobra/falta real); fechamento conciliado vai direto.

### 4. Payload (`buildPayload`)

- `closingStatus` passa a aceitar `"reconciled_with_mismatch"` além dos atuais.
- `closingJustification` enviado somente se `requiresJustification`.
- `justifications` por meio: continuar gravando texto da justificativa nas linhas com diff (apenas quando há justificativa real); para fechamento conciliado essas ficam nulas.

### 5. Tipo `CloseCashierPayload` em `src/hooks/use-pdv-cashier.ts`

Atualizar a união `closingStatus` para incluir `"reconciled_with_mismatch"`. O campo já é gravado em `closing_status` (text) na tabela `pdv_cashier_sessions` — nenhuma migração necessária.

## Fora do escopo

- Sem mudanças em backend/SQL além da string nova de status (coluna é texto livre).
- Sem mudanças em `printCashierReport` além de, opcionalmente, refletir o novo status no rótulo (nice-to-have).
