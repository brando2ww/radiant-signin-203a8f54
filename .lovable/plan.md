## Causa

O erro `record "v_item" has no field "status"` vem da função SQL `public.pdv_transfer_items`, que valida os itens antes de movê-los entre comandas/mesas usando:

```sql
IF COALESCE(v_item.status,'ativo') = 'cancelado' THEN ...
```

A tabela `pdv_comanda_items` não tem coluna `status` (nem `updated_at`). Os campos reais relevantes são `kitchen_status`, `paid_quantity` e `charging_session_id`. Como o SELECT usa `ci.*`, o registro `v_item` não possui `status`, e o Postgres aborta a transferência logo no primeiro item.

Também há dois `UPDATE pdv_comanda_items SET ... updated_at = now()` dentro da mesma função que falhariam pelo mesmo motivo (coluna inexistente) caso a execução chegasse até lá.

## Correção (apenas no banco, via migration)

Substituir a função `pdv_transfer_items` por uma versão idêntica, exceto:

1. Remover a checagem `IF COALESCE(v_item.status,'ativo') = 'cancelado'` — a tabela não tem esse conceito hoje. As outras travas (`paid_quantity`, `charging_session_id`) continuam protegendo contra mover itens já pagos ou em cobrança.
2. Remover `updated_at = now()` dos dois `UPDATE public.pdv_comanda_items` (a coluna não existe).

Nenhuma mudança no frontend é necessária — `usePDVItemTransfer` segue chamando `pdv_transfer_items(...)` com a mesma assinatura.

## Verificação

- Reproduzir o fluxo "Transferir item" entre Mesa 04 → Mesa 02 do screenshot e confirmar sucesso.
- Conferir no `pdv_action_audit_log` que a entrada de auditoria foi criada.