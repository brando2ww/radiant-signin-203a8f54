## Problema

No caixa, a cobrança por produto funciona pela coluna **Salão** (cada card de comanda chama `handleSelectComanda` direto), mas **não** funciona quando o usuário clica em **Cobrar** nas Ações Rápidas / atalho F5 do sidebar.

Ao analisar `src/pages/pdv/Cashier.tsx` e `src/components/pdv/cashier/ChargeSelectionDialog.tsx`:

- O botão **Cobrar** abre o `ChargeSelectionDialog` com duas abas: *Comandas* (avulsas) e *Mesas* (ocupadas).
- Na prática, as comandas vindas do garçom têm `order_id` (estão atreladas a mesa), então elas **não aparecem** na aba *Comandas* — só na aba *Mesas* (agregadas).
- Ao escolher uma mesa, o fluxo chama `handleSelectTable` → `PaymentDialog` com `isTablePayment = true`.
- Em `PaymentDialog.tsx` a regra é `supportsByProduct = liveItemsForPayment.length > 0 && !isTablePayment`, então o botão **Por produto** fica desabilitado (tooltip: "Disponível apenas para comandas individuais com itens persistidos").

Por isso o atalho do sidebar nunca permite cobrar por produto, enquanto na coluna Salão (que sempre seleciona a comanda específica) permite.

## Solução

Tornar a aba **Mesas** do `ChargeSelectionDialog` expansível para listar as comandas individuais da mesa, igualando o comportamento ao painel Salão. O usuário continua podendo "Cobrar mesa toda" (rota atual), e ganha a opção de "Cobrar comanda X" (rota individual, que habilita Por produto).

## Mudanças

### `src/components/pdv/cashier/ChargeSelectionDialog.tsx`
- Manter o card da mesa, mas adicionar área expansível listando cada comanda do `getComandasForTable(table)` com nome do cliente, nº, qtd. de itens e subtotal.
- Cada comanda renderiza um botão **Cobrar** que chama `onSelectComanda(comanda, getItemsByComanda(comanda.id))` (mesmo handler do salão).
- Manter o botão **Cobrar mesa toda** (rota atual) quando a mesa tiver 2+ comandas; quando tiver 1 comanda só, o clique no card já encaminha direto para `onSelectComanda` (atalho).
- Sem alterações em cores/estilos custom — usar tokens existentes.

### Nada muda em
- `PaymentDialog.tsx` (regra de `supportsByProduct` continua válida).
- `Cashier.tsx` (handlers já existentes).
- Atalho de teclado F5 (já usa `handleSelectComanda` da fila — funciona).

## Validação

- Abrir caixa, ter uma mesa com 1 comanda do garçom → clicar **Cobrar** no sidebar → escolher a mesa → `PaymentDialog` abre com **Por produto** habilitado.
- Mesa com 2+ comandas → dialog mostra lista expandida; clicar **Cobrar** numa comanda específica habilita Por produto; **Cobrar mesa toda** mantém comportamento atual.
- Comanda avulsa (sem mesa) na aba *Comandas* continua funcionando como hoje.