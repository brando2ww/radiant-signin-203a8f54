## Diagnóstico

Tela congela ao cancelar pedido do delivery porque o `handleCancel` em `OrderDetailDialog.tsx` fecha o `AlertDialog` e o `Dialog` principal simultaneamente no mesmo tick. O Radix UI deixa `pointer-events: none` aplicado ao `<body>` quando dois overlays se desmontam em paralelo, travando toda a interface.

## Plano

Em `src/components/delivery/OrderDetailDialog.tsx`, ajustar `handleCancel` para:
1. Fechar primeiro o `AlertDialog` de cancelamento e limpar `cancelReason`.
2. Defer o fechamento do `Dialog` principal com `setTimeout(..., 0)` para que os overlays sejam desmontados em sequência, liberando `pointer-events` no body.

Padrão alinhado com a memória "Dialog UI" do projeto (deferir abertura/fechamento de dialogs aninhados).

Sem mudanças no hook `useCancelOrder` nem no banco de dados.