## Objetivo

Tratar **Vendas a Prazo (fiado)** como qualquer outra forma de pagamento no fechamento de caixa: campo de apuração às cegas na etapa 1, linha de conferência com diferença/justificativa na etapa 2, somando no total geral.

## Mudanças em `src/components/pdv/CloseCashierDialog.tsx`

1. **Estado novo:** `declaredFiado` (string) e `justFiado` (string), reset junto com os demais; hidratação a partir de `snap.declared_fiado` no efeito de reabertura.

2. **Etapa 1 (blind):**
   - Substituir o card informativo por `<BlindInput icon={UserCheck} label="Vendas a Prazo" value={declaredFiado} onChange={setDeclaredFiado} />`, renderizado apenas quando `totalFiado > 0`.
   - Incluir `declaredFiado` em `allBlindFilled` (condicional a `totalFiado > 0`) e em `blindTotal`.
   - Passar `declaredFiado: parseN(declaredFiado)` ao `submitBlindClosing` (novo campo).

3. **Etapa 2 (review):**
   - Remover o card informativo de fiado.
   - Adicionar linha em `reviewRows` quando `totalFiado > 0 || declaredFiado !== ""`: `{ key: "fiado", label: "Vendas a Prazo", icon: UserCheck, expected: totalFiado, declared: parseN(declaredFiado), justification: justFiado, setJust: setJustFiado }`.
   - Estender `Row["key"]` com `"fiado"`.

4. **Payload:**
   - `declaredFiado` em `buildPayload()` → `declaredFiado: parseOpt(declaredFiado)` e `justifications.fiado`.
   - `printCashierReport` recebe `declared_fiado` no `session` para a impressão.

## Backend — hook e tipos

5. **`src/hooks/use-pdv-cashier.ts` (`closeCashier`):**
   - Aceitar `declaredFiado?: number | null` e `justifications.fiado?: string` no `CloseCashierPayload`.
   - Calcular `fiadoDiff = declaredFiado != null ? declaredFiado - totalFiado : null` (após ler `total_fiado` no select).
   - Incluir `declared_fiado`, `fiado_difference`, `justification_fiado` no `updateData`.
   - Adicionar `justifications.fiado` ao predicado de `differenceJustified`.
   - Adicionar `total_fiado` ao `select(...)` da sessão.

## Banco — migration

6. `ALTER TABLE pdv_cashier_sessions` adicionar colunas:
   - `declared_fiado numeric`
   - `fiado_difference numeric`
   - `justification_fiado text`

## Impressão

7. **`CloseCashierDialog.printCashierReport`:**
   - Ler `totalFiado` e `declaredFiado = session?.declared_fiado` da sessão.
   - Adicionar linha em `conferenceRows`: `["Vendas a Prazo", totalFiado, declaredFiado]`.
   - Remover a linha extra "Vendas a Prazo (fiado)" que adicionamos antes do "Total de Vendas", já que agora consta na conferência.

## Fora de escopo

- Nenhuma mudança na coleta da venda (continua via `registerCreditSale`).
- Card "Vendas por forma de pagamento" no painel principal já mostra a linha.
