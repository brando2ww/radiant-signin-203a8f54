## Problemas identificados

### 1. Mesa de origem continua mostrando valor após transferência
A trigger `update_comanda_subtotal_trigger` (em `pdv_comanda_items`) só recalcula **uma** comanda por linha:

```sql
v_comanda_id := COALESCE(NEW.comanda_id, OLD.comanda_id);
```

Quando o `pdv_transfer_items` faz `UPDATE pdv_comanda_items SET comanda_id = <destino>`, `NEW.comanda_id` é o destino e o `COALESCE` ignora `OLD.comanda_id`. Resultado: a comanda de origem **nunca é recalculada**, então `subtotal` e `pending_subtotal` ficam congelados com o valor antigo — exatamente o que aparece na Mesa 4.

Além disso, se a transferência esvaziar todas as comandas da mesa de origem, hoje a mesa permanece marcada como `ocupada` com `current_order_id` apontando para o `pdv_orders` antigo, em vez de voltar a `livre`.

### 2. Não dá para nomear a comanda criada na mesa destino
Quando o destino é uma mesa livre, o RPC `pdv_transfer_items` cria automaticamente uma `pdv_comanda` com nome genérico (`CMD-yyyymmddHH...`) e `customer_name = NULL`. O `TransferItemsDialog` não oferece nenhum campo para nomear essa comanda nova, então o garçom perde a referência do cliente.

## Correção

### Migration (banco)

**A.** Atualizar a função `update_comanda_subtotal` para recalcular **ambas** as comandas envolvidas em um `UPDATE` (origem e destino):

```sql
-- recalcula tanto OLD.comanda_id quanto NEW.comanda_id quando diferentes
FOR v_id IN SELECT DISTINCT unnest(ARRAY[OLD.comanda_id, NEW.comanda_id]) ...
```
Isso resolve sozinho o "valor fantasma" da Mesa 4.

**B.** Estender `pdv_transfer_items` para, ao final, verificar se a comanda de origem ficou sem itens; se sim, fechá-la (`status = 'cancelada'` ou manter `aberta` mas zerada — manter `aberta` é mais seguro para histórico). E se o `pdv_orders` de origem ficou sem nenhuma comanda com itens, liberar a mesa:

```sql
-- após o loop:
IF NOT EXISTS (SELECT 1 FROM pdv_comanda_items WHERE comanda_id IN (...origem...)) THEN
   UPDATE pdv_tables
      SET status = 'livre', current_order_id = NULL, updated_at = now()
    WHERE current_order_id = v_src_order_id
      AND NOT EXISTS (SELECT 1 FROM pdv_comanda_items ci
                      JOIN pdv_comandas c ON c.id = ci.comanda_id
                      WHERE c.order_id = v_src_order_id);
   UPDATE pdv_orders SET status='fechado', closed_at=now() WHERE id = v_src_order_id;
END IF;
```

**C.** Aceitar um parâmetro opcional `p_target_comanda_name text` que, quando o RPC criar a `pdv_comanda` nova na mesa destino, popula `customer_name`.

### Frontend

**D.** Em `TransferItemsDialog.tsx`, quando o destino selecionado for uma mesa livre (`destination.kind === "table"` e a mesa não tem `current_order_id`), exibir no passo "Confirmar" um `Input` "Nome da comanda (opcional)" — análogo ao `ComandaDialog`. Passar esse valor para `transferItems({ ..., targetComandaName })`.

**E.** Em `use-pdv-comandas.ts`, adicionar `targetComandaName` ao payload do `supabase.rpc("pdv_transfer_items", { ..., p_target_comanda_name })`.

Nada mais muda — invalidações de cache já existem em `usePDVComandas` + realtime em `usePDVComandasRealtime` e atualizarão Mesa 4 e Mesa 5 automaticamente assim que o subtotal correto for gravado.

## Verificação

1. Reproduzir Mesa 4 → Mesa 5: a Mesa 4 deve voltar ao status livre (R$ 0,00) imediatamente.
2. Transferir para mesa livre informando nome "João" → a comanda criada deve aparecer com "João" na Mesa 5.
3. Conferir `pdv_action_audit_log` continua registrando a transferência.
