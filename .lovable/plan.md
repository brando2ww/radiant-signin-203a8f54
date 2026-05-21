## Objetivo

Fazer toda venda lançada como **À Prazo** aparecer:

1. Na **lista de Movimentações** do caixa (rota `/pdv/caixa`).
2. No **card "Vendas por forma de pagamento"** como linha `Vendas a Prazo`.
3. No **demonstrativo impresso** (fechamento de caixa).

Hoje a venda a prazo cria `pdv_employee_consumption_entries` + `pdv_payments(method='fiado')`, mas **não** insere nada em `pdv_cashier_movements`, então não soma nos totais da sessão nem aparece na lista de movimentações.

## Banco de dados (migration)

1. `ALTER TABLE pdv_cashier_sessions ADD COLUMN total_fiado numeric NOT NULL DEFAULT 0;`
2. Recriar `pdv_recompute_session_totals(p_session_id)`:
   - Adicionar `total_fiado = SUM(CASE WHEN type='venda' AND payment_method='fiado' THEN amount END)`.
   - Excluir `'fiado'` do filtro de `total_other` (para não duplicar).
   - `total_sales` continua somando todas as vendas (incluindo fiado).
3. Backfill: rodar `pdv_recompute_session_totals` para todas as sessões abertas existentes.

> Nota: o constraint de `payment_method` em `pdv_cashier_movements` já aceita `'fiado'` (migration `20260521143812`).

## Backend (hook)

**`src/hooks/use-employee-consumption.ts` → `registerCreditSale`**

Depois de criar a entry e fechar a comanda, **inserir um movimento no caixa ativo** (somente se houver sessão aberta):

```ts
const { data: activeSession } = await supabase
  .from("pdv_cashier_sessions")
  .select("id")
  .eq("user_id", ownerId)
  .is("closed_at", null)
  .order("opened_at", { ascending: false })
  .maybeSingle();

if (activeSession?.id) {
  await supabase.from("pdv_cashier_movements").insert({
    user_id: ownerId,
    cashier_session_id: activeSession.id,
    operator_id: user.id,
    type: "venda",
    payment_method: "fiado",
    amount: params.amount,
    description: `Venda a prazo — ${employeeName}`,
    source: "credit_sale",
    order_id: params.order_id ?? null,
  });
  await supabase.rpc("pdv_recompute_session_totals", { p_session_id: activeSession.id });
}
```

`employee_name` é recebido via novo parâmetro opcional (`employee_name?: string`) preenchido pelo `PaymentDialog` (já temos `payload.employee_name` no `CreditSaleAuthDialog`).

Invalidações novas no `onSuccess`: `pdv-cashier-movements`, `pdv-cashier-active`.

## Frontend

**`src/components/pdv/cashier/CashierSummaryFooter.tsx`**
- Nova prop `totalFiado: number`.
- Linha `<SummaryRow icon={UserCheck} label="Vendas a Prazo" value={totalFiado} />` no grid do bloco 2.

**`src/pages/pdv/Cashier.tsx`**
- Ler `totalFiado = (activeSession as any)?.total_fiado || 0` e passar ao footer.

**`src/components/pdv/CashMovementsList.tsx`**
- Estender `PaymentMethodKey` com `"fiado"`.
- Entrada no `PAYMENT_METHOD_CONFIG`: `fiado: { label: "À Prazo", icon: UserCheck }`.

**`src/components/pdv/CloseCashierDialog.tsx` (impressão)**
- Ler `totalFiado` da `session`.
- Adicionar linha `Vendas a Prazo: ${formatBRL(totalFiado)}` na seção pós-conferência, antes do `Total de Vendas (sistema)`.
- Adicionar `fiado: "À Prazo"` ao `methodMap` da tabela de movimentações.

## Fora de escopo

- Conferência cega de fiado no fechamento (não há contagem física — é informativo).
- Alterações em relatórios financeiros (DRE / fluxo de caixa) — fiado continua entrando no caixa apenas na quitação.
