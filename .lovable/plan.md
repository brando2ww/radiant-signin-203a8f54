# Bugs do módulo financeiro — correções

## 1. `PDVTransactionDialog.tsx` — form não reseta

Substituir `defaultValues` por uma factory + `useEffect` que faz `form.reset(getDefaults(transaction))` sempre que `transaction?.id` ou `open` mudarem. Manter `defaultValues` no `useForm` apenas como valor inicial.

```ts
const getDefaults = (t?: PDVFinancialTransaction): PDVFinancialTransactionFormData =>
  t ? { /* mapeia t */ } : { transaction_type: 'payable', status: 'pending', amount: 0, description: '', due_date: new Date() };

useEffect(() => {
  if (open) form.reset(getDefaults(transaction));
}, [open, transaction?.id]);
```

Também remover o efeito colateral fora de hook (`if (paymentDate && status === 'pending') form.setValue(...)`) — mover para um `useEffect` com dependências `[paymentDate, status]` para evitar render loops.

## 2. `PDVTransactionDialog.tsx` — dialog fecha com erro

```ts
const handleSubmit = async (data) => {
  try {
    await onSubmit(transaction ? { id: transaction.id, ...data } : data);
    onOpenChange(false);
    form.reset(getDefaults());
  } catch (err: any) {
    toast.error(err?.message || 'Falha ao salvar lançamento');
  }
};
```

Import `toast` de `sonner`. Não fecha em caso de erro.

## 3. `DiscountsReport.tsx` — relatório incompleto

Adicionar fetch paralelo de `pdv_orders` com `discount > 0`:

```ts
supabase.from('pdv_orders')
  .select('id, order_number, customer_name, subtotal, discount, total, source, closed_at, created_at, status')
  .eq('user_id', visibleUserId!)
  .gt('discount', 0)
  .not('status','in','(cancelled,cancelado,aberta,open)')
  .gte('created_at', startISO)
  .lte('created_at', endISO)
```

- Mapear `source` → `origin`: `delivery_orders` → `"Delivery"`; `pdv_orders.source === 'salao'` (ou table_id presente) → `"Salão"`; demais (`balcao`, `comanda` avulsa) → `"Balcão"`.
- Concatenar `orders` das duas fontes; cada item ganha `origin`.
- Adicionar agregação `byOrigin` (count, discount, revenue) e renderizar um novo card "Descontos por origem" com 3 linhas (Delivery / Salão / Balcão).
- Tabela "Pedidos com desconto" ganha coluna **Origem**.
- Aba do XLSX "Descontos Diretos" inclui coluna `origem`.
- KPIs e `byCoupon`/`byDay` consideram a soma das duas fontes (pedidos PDV não têm `coupon_code` → caem em `(sem cupom)`).

## 4. `FinancialTransactions.tsx` — handlers sem try/catch

Envolver `handleSubmit`, `handleMarkAsPaidSubmit` e `handleDelete` em try/catch com `toast.error`. Como o hook já mostra toasts em `onError`, manter os catches re-lançando o erro (`throw err`) apenas para `handleSubmit` (assim o dialog do item 2 detecta e mantém o modal aberto). `handleDelete` e `handleMarkAsPaidSubmit` ficam com toast extra de segurança caso a mutation lance algo fora do `onError`.

## 5. `PDVTransactionFilters.tsx` — filtro "all"

No `onValueChange` do select de tipo, mapear `'all'` para `undefined` antes de propagar:

```ts
onValueChange={(value) =>
  onFiltersChange({ ...filters, transaction_type: value === 'all' ? undefined : (value as any) })
}
```

Padroniza com os outros filtros e evita o valor `'all'` literal vazar para a query mesmo se o guard do hook for removido.

## 6. `FinancialTransactions.tsx` — filtro local da aba

Remover o `transactions.filter(...)` local. Em vez disso, derivar filtros adicionais da aba e mesclar em `filters` quando aplicáveis:

- `activeTab === 'payable'` → `transaction_type='payable'`, `status=['pending']`
- `activeTab === 'receivable'` → `transaction_type='receivable'`, `status=['pending']`
- `activeTab === 'overdue'` → `status=['overdue']` + `due_date_to=today-1` para incluir pendentes vencidos (alternativa: usar `status=['overdue','pending']` com `due_date_to=startOfToday`). Vai com `status=['overdue']` + cliente complementa pendentes vencidos via segunda condição já presente no hook (ou ampliar o hook com flag `include_overdue_pending`).
- `activeTab === 'paid'` → `status=['paid']`
- `activeTab === 'all'` → sem override.

Implementação: `const effectiveFilters = useMemo(() => ({ ...filters, ...tabOverrides(activeTab, filters) }), [filters, activeTab])` e passar para `usePDVFinancialTransactions(effectiveFilters)`. A lista renderiza `transactions` direto, sem `.filter`. Contagens das abas continuam vindo de `stats` (já corretas no server).

Para a aba "Vencidas" usar `status=['overdue']` combinado com `or` no hook ou simplesmente um segundo filtro `due_date_to = today` mais `status=['pending','overdue']` — vou estender `TransactionFilters` com `overdue_only?: boolean` e tratar no hook (`status in ('overdue') OR (status='pending' AND due_date < today)`).

## 7. `MarkAsPaidDialog.tsx` — estado não reseta

Adicionar:

```ts
useEffect(() => {
  if (open) {
    setPaymentDate(new Date());
    setPaymentMethod('');
    setBankAccountId('');
  }
}, [open]);
```

## Arquivos a editar

- `src/components/pdv/financial/PDVTransactionDialog.tsx` (itens 1 e 2)
- `src/components/pdv/financial/PDVTransactionFilters.tsx` (item 5)
- `src/components/pdv/financial/MarkAsPaidDialog.tsx` (item 7)
- `src/pages/pdv/financial/FinancialTransactions.tsx` (itens 4 e 6)
- `src/hooks/use-pdv-financial-transactions.ts` (item 6: suporte a `overdue_only`)
- `src/pages/pdv/reports/DiscountsReport.tsx` (item 3)
