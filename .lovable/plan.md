## Diagnóstico

Hoje existem dois fluxos distintos no PDV:

1. **Trocar mesa** (`ChangeTableDialog` + RPC `pdv_change_table`)
   - Move toda a ocupação de uma mesa para **outra mesa livre**.
   - O dialog só lista mesas com `status = 'livre'`.
   - O RPC bloqueia explicitamente destinos ocupados:
     ```
     IF v_dst.current_order_id IS NOT NULL OR v_dst.status <> 'livre' THEN
       RAISE EXCEPTION 'Mesa de destino não está livre';
     ```
   - É por isso que “não deixa enviar para mesa aberta”.

2. **Mover itens** (`TransferItemsDialog` + RPC `pdv_transfer_items`)
   - Move itens individuais para outra comanda/mesa.
   - Já aceita mesa ocupada como destino, mas exige selecionar item por item — não serve para “juntar duas mesas”.

O usuário quer poder mandar uma mesa para outra **mesa já aberta** (juntar/mesclar mesas), o que hoje é impossível pelos dois fluxos.

## Plano

### 1. Permitir mesclar mesa origem em mesa destino ocupada

**Backend — novo comportamento do `pdv_change_table`:**
- Se a mesa destino estiver **livre**: comportamento atual (move o order da origem).
- Se a mesa destino estiver **ocupada**: mesclar
  - Reatribuir todas as comandas abertas do `order` da origem para o `order` da mesa destino (`UPDATE pdv_comandas SET order_id = destino`).
  - Cancelar/fechar o `order` antigo da origem (sem itens restantes) e liberar a mesa origem (`status = 'livre'`, `current_order_id = NULL`).
  - Logar a ação como merge (`log_pdv_action` com flag `merged: true`).
- Bloquear merge se a mesa destino tiver comandas com status `em_cobranca` (alguma cobrança ativa) — mensagem clara.
- Validar capacidade: se ocupação combinada exceder `capacity` da mesa destino, apenas avisar (não bloquear) via retorno; o frontend mostra confirmação.

### 2. Atualizar `ChangeTableDialog` para listar mesas ocupadas

- Mostrar duas seções: **Mesas livres** e **Mesas ocupadas** (com nome/quantidade de comandas).
- Ao escolher mesa ocupada, exibir aviso: “As comandas da {origem} serão mescladas em {destino}. A {origem} ficará livre.”
- Exigir motivo obrigatório quando o destino for ocupado, mesmo que `requiresReason('change_table')` esteja desligado.
- Manter a permissão `change_table`.

### 3. Validação visual

- Após a operação, refetch de `pdv_tables`, `pdv_orders`, `pdv_comandas`.
- Toast: “Mesa {origem} mesclada em {destino}”.

### Arquivos afetados

- `supabase/migrations/<nova>.sql` — atualizar `pdv_change_table` para aceitar destino ocupado e mesclar.
- `src/components/pdv/operations/ChangeTableDialog.tsx` — listar mesas ocupadas + aviso de merge + motivo.
- `src/hooks/use-pdv-table-change.ts` — manter assinatura, ajustar mensagem do toast (origem/destino).

### Critério de aceitação

- Em uma mesa A ocupada, abrir “Trocar mesa” e selecionar a mesa B (também ocupada): operação conclui com sucesso, mesa A fica livre e a mesa B passa a ter as comandas das duas.
- Mesa B com comanda `em_cobranca`: operação bloqueada com mensagem clara.
- Mesa B livre: comportamento atual continua funcionando igual.