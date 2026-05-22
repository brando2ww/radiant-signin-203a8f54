## Objetivo

Os blocos "Gaveta (dinheiro físico)" e "Vendas por forma de pagamento" na tela `/pdv/caixa` devem se atualizar automaticamente (sem recarregar a página) sempre que houver uma venda, sangria ou reforço.

## Causa atual

Esses blocos leem `activeSession` (totais em `pdv_cashier_sessions`) e `movements` (`pdv_cashier_movements`) via `usePDVCashier`. Hoje só existe Realtime para comandas/mesas/pedidos (`usePDVComandasRealtime`), não para a sessão de caixa nem para seus movimentos — por isso só atualizam após reload.

## Mudanças

1. **Novo hook `src/hooks/use-pdv-cashier-realtime.ts`**
   - Recebe `sessionId` (id da sessão de caixa ativa).
   - Cria um canal Supabase Realtime que escuta:
     - `pdv_cashier_sessions` filtrado por `id=eq.{sessionId}` (capta atualizações de `total_cash`, `total_credit`, `total_debit`, `total_pix`, `total_voucher`, `total_online_delivery`, `total_fiado`, `total_withdrawals` feitas pelo trigger / `pdv_recompute_session_totals`).
     - `pdv_cashier_movements` filtrado por `cashier_session_id=eq.{sessionId}` (capta novas vendas, sangrias e reforços).
   - Em qualquer evento, invalida as queries `["pdv-cashier-active"]` e `["pdv-cashier-movements"]`.
   - Limpa o canal no unmount / quando `sessionId` muda.

2. **`src/pages/pdv/Cashier.tsx`**
   - Importar e chamar o novo hook passando `activeSession?.id` logo após `usePDVComandasRealtime()`.

Nenhum outro arquivo precisa ser tocado: como o `CashierSummaryFooter` é puramente apresentacional e recebe seus valores derivados de `activeSession` + `movements`, a invalidação dispara o re-render automaticamente.

## Fora de escopo

- Não alterar lógica de negócio, cálculos nem layout.
- Não mexer em comandas/mesas (já cobertas por `usePDVComandasRealtime`).
