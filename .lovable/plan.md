# Transferência de itens entre mesas — app do garçom

Hoje o app do garçom (`/garcom/comanda/:id`) já permite mover **itens já enviados** para outra **comanda aberta** (em mesa ocupada ou avulsa) via botão "Selecionar → Mover". O RPC `pdv_transfer_items` já suporta destino mesa (`targetKind="table"`) e quantidade parcial (`qtyMap`).

Esta entrega cobre 4 melhorias para corrigir lançamentos errados rapidamente, sem exigir senha (qualquer garçom pode mover).

## 1. Transferir para mesa vazia

No `TransferItemsDialog`, adicionar uma seção **"Mesas livres"** acima de "Mesas ocupadas":
- Lista mesas com `status = "livre"` (sem `current_order_id`).
- Ao selecionar, chama `transferItems({ targetKind: "table", targetId: tableId })`. O RPC já cuida de abrir um `pdv_order` + `pdv_comanda` na mesa destino.
- Ícone/label distintos ("Mesa X — livre"), busca por número de mesa funciona normalmente.

## 2. Transferir comanda inteira

Atalho rápido no `GarcomComandaDetalhe`:
- Novo item no header (ao lado de "Selecionar"): **"Mover comanda"** (ícone `ArrowRightLeft`).
- Abre o mesmo `TransferItemsDialog` pré-selecionando todos os `sentItems` (sem entrar em `selectMode`).
- Título do diálogo muda para "Mover comanda inteira para…".
- Após sucesso, navega de volta para `/garcom/mesas` (a comanda origem fica vazia/aberta — comportamento já documentado no diálogo).

## 3. Transferir itens do rascunho (não enviados)

Itens em `draftItems` ficam no `localStorage` (DraftCartContext) e não existem no banco — então a transferência precisa ser puramente client-side:
- Em `selectMode`, listar **também** os `draftItems` (com badge "Rascunho") junto dos `sentItems`.
- Ao confirmar mover N itens de rascunho para comanda destino C:
  1. Remove os `draftItems` do `DraftCartContext` da comanda origem.
  2. Adiciona os mesmos itens ao `DraftCartContext` da comanda destino C (via `draft.addItem` por item).
  3. Para itens "mistos" (rascunho + enviados), o fluxo executa as duas operações em sequência (RPC para enviados + manipulação local para rascunho) e mostra um único toast.
- Restrição: itens de rascunho **só podem ir para outra comanda existente** (não para mesa livre, pois a comanda destino precisa existir para receber os drafts). Se o garçom escolher mesa livre com drafts selecionados, mostrar aviso explicando.

## 4. Quantidade parcial

No passo "Confirmar transferência" do `TransferItemsDialog`:
- Para cada item enviado com `quantity > 1`, exibir um stepper (`− N +`) ao lado, default = quantidade total.
- Estado local `qtyMap: Record<itemId, number>` é passado para `transferItems({ qtyMap })`.
- Itens de rascunho usam o mesmo padrão, mas a divisão é feita no `DraftCartContext` (split do item local em dois).
- Validação: cada quantidade entre 1 e quantidade original.

---

## Arquivos afetados

**Modificados:**
- `src/components/pdv/transfer/TransferItemsDialog.tsx` — adiciona seção "Mesas livres", stepper de quantidade parcial, suporte a items "draft" como entrada (nova prop `draftItems` + callback `onDraftTransferred`).
- `src/pages/garcom/GarcomComandaDetalhe.tsx` — botão "Mover comanda" no header; em `selectMode`, listar também drafts; orquestra transferência mista (drafts + enviados).
- `src/contexts/DraftCartContext.tsx` — exposição de helper `transferDraftItems(fromComandaId, toComandaId, draftIds, qtyMap)` para mover/dividir itens entre carrinhos locais.

**Sem mudanças no backend** — o RPC `pdv_transfer_items` já cobre mesa-destino e qtyMap; drafts são puramente client-side.

## Fora de escopo
- Senha de gerente para autorizar (mantido livre).
- Histórico visual de transferências dentro do app do garçom (já fica no log de auditoria do RPC).
- Replicar essas melhorias no diálogo do Salon/Comandas desktop — pode ser feito depois reutilizando o mesmo componente.
