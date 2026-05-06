## Objetivo
Não permitir fechar o caixa enquanto houver pedidos de delivery que ainda não foram concluídos (entregues) ou cancelados.

## Regra
Pedido de delivery é considerado **finalizado** quando `status` for `completed` ou `cancelled`. Qualquer outro status (`pending`, `confirmed`, `preparing`, `ready`, `delivering`) bloqueia o fechamento do caixa.

## Mudanças

### 1. `src/pages/pdv/Cashier.tsx`
- Importar `usePDVDeliveryQueue` (já existente, filtra delivery por dono do estabelecimento).
- Em `handleTryCloseCashier`, além do check atual de comandas abertas, calcular:
  ```
  pendingDelivery = orders.filter(o => !['completed','cancelled'].includes(o.status))
  ```
  Se `pendingDelivery.length > 0`, exibir `toast.error` informando a quantidade e abortar (`return`) antes de abrir o `CloseCashierDialog`.
- Mensagem: `"Existem N pedido(s) de delivery em andamento. Conclua ou cancele todos antes de encerrar o caixa."`

### 2. (Opcional, mesma tela) Aviso visual
- No `CashierActionsSidebar` o botão "Fechar Caixa" continua ativo, mas o clique é bloqueado pelo guard acima. Sem mudança de UI necessária.

## Fora do escopo
- Não alterar a função SQL/RPC de fechamento (defesa adicional no backend pode ser feita depois, se necessário).
- Não tocar em pedidos de salão/comandas (já validado).
- Sem mudança em hooks de delivery.

## Arquivos afetados
- `src/pages/pdv/Cashier.tsx` (único arquivo)
