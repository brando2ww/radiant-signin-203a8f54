# Correções no Caixa — Saldo da gaveta como fonte única de verdade

Os três problemas têm a mesma raiz: o saldo real da gaveta não é calculado de forma consistente nem usado para validar operações.

## Diagnóstico

**Problema 1 — fórmula errada do dinheiro líquido**

Em `src/hooks/use-pdv-payments.ts` (`buildSessionDeltas`), cada venda em dinheiro já incrementa `total_cash` com o **valor da venda** (não com o valor entregue). Já o `total_change` recebe o troco. Em `src/pages/pdv/Cashier.tsx` o código faz:

```
netCash = totalCash - totalChange
```

Como `totalCash` já é o valor líquido da venda, subtrair o troco gera o erro: 23,70 − 26,30 = −2,60 (no exemplo do usuário, somado a outras vendas chega aos R$ 5,30 reportados). O correto é `netCash = totalCash`. O campo `total_change` deve permanecer apenas como histórico/auditoria, sem entrar no saldo da gaveta.

**Problemas 2 e 3 — falta de validação contra o saldo da gaveta**

Nem `PaymentDialog` (entrada de dinheiro/cálculo de troco) nem `CashMovementDialog` (sangria) consultam o saldo real disponível na gaveta antes de confirmar a operação.

## Mudanças

### 1. Centralizar o saldo da gaveta no hook `use-pdv-cashier`

Em `src/hooks/use-pdv-cashier.ts`, calcular e expor:

```
drawerBalance =
    opening_balance
  + total_cash           // já é Σ valor da venda em dinheiro
  + Σ reforços (movements type=reforco)
  − total_withdrawals    // sangrias confirmadas
```

Retornar `drawerBalance` (e `totalReinforcements`) do hook para que **PaymentDialog**, **CashMovementDialog**, **CashierSummaryFooter** e **Cashier.tsx** consumam o mesmo valor — fonte única de verdade.

### 2. Corrigir Problema 1 — dinheiro líquido

`src/pages/pdv/Cashier.tsx` e `src/components/pdv/cashier/CashierSummaryFooter.tsx`:

- Remover a subtração `totalCash − totalChange`.
- `netCash = totalCash` (Σ valor das vendas em dinheiro).
- Renomear o rótulo no rodapé de **"Dinheiro líquido (− troco)"** para **"Dinheiro de vendas"** para refletir o significado correto. O troco deixa de aparecer no bloco da gaveta (continua na auditoria/relatório de fechamento se necessário).

### 3. Corrigir Problema 2 — bloquear troco maior que saldo da gaveta

Em `src/components/pdv/cashier/PaymentDialog.tsx`, na seção de pagamento em Dinheiro:

- Receber `drawerBalance` (via prop ou diretamente do hook `usePDVCashier`).
- **Sempre exibir**, antes do operador digitar o valor entregue:
  > Saldo disponível para troco: R$ X,XX
- Calcular o troco em tempo real (já existe).
- Se `changeAmount > drawerBalance`:
  - Exibir alerta destacado:
    > "Troco insuficiente — necessário R$ X,XX, gaveta tem R$ Y,YY. Faltam R$ Z,ZZ. Solicite ao cliente o valor exato ou outra forma de pagamento."
  - Desabilitar o botão **Confirmar pagamento**.
- Sem opção de forçar / sem justificativa que libere — bloqueio absoluto.
- No pagamento misto (split por método), aplicar a mesma regra apenas à(s) linha(s) com método `dinheiro`.

### 4. Corrigir Problema 3 — bloquear sangria maior que saldo

Em `src/components/pdv/CashMovementDialog.tsx`:

- Receber `drawerBalance` via prop (passado de `Cashier.tsx`).
- Quando `type === "sangria"`, **sempre exibir** acima do campo Valor:
  > Saldo disponível: R$ X,XX
- Se `parseFloat(amount) > drawerBalance`:
  - Exibir alerta:
    > "Sangria não permitida — valor (R$ X,XX) maior que o saldo da gaveta (R$ Y,YY)."
  - Desabilitar o botão **Registrar**.
- Reforço continua sem restrição de teto.

### 5. Defesa em profundidade (opcional, recomendado)

Adicionar verificação no `addMovement` (mutação) do `use-pdv-cashier.ts`: se `type === "sangria"` e `amount > drawerBalance`, lançar erro com a mesma mensagem antes de chamar o Supabase. Garante que mesmo chamadas programáticas respeitem a regra.

## Arquivos afetados

- `src/hooks/use-pdv-cashier.ts` — expor `drawerBalance` e `totalReinforcements`; validar sangria.
- `src/pages/pdv/Cashier.tsx` — consumir `drawerBalance` do hook; remover cálculo duplicado; passar para os dialogs.
- `src/components/pdv/cashier/CashierSummaryFooter.tsx` — `netCash = totalCash`; renomear rótulo; remover linha de subtração de troco.
- `src/components/pdv/cashier/PaymentDialog.tsx` — exibir saldo disponível, validar troco, desabilitar confirmação.
- `src/components/pdv/CashMovementDialog.tsx` — exibir saldo, validar sangria, desabilitar registro.

Nenhuma migração de banco é necessária — o problema 1 é puramente de cálculo no front.
