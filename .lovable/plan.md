## Adicionar "Cancelar comanda" no PaymentDialog

Hoje o botão **Cancelar** no rodapé do diálogo de pagamento apenas fecha o modal — não há como cancelar a comanda de dentro da tela de cobrança. A solução é adicionar uma ação destrutiva explícita reaproveitando o `CancelComandaDialog` que já foi criado.

### Mudanças

**1. Rodapé do `PaymentDialog.tsx`**

Renomear o atual botão "Cancelar" (que só fecha) para **"Fechar"** (variante `outline`, ícone X) e adicionar, ao lado dele, um botão **"Cancelar comanda"** (variante `ghost` em vermelho, ícone `Ban`). Layout do rodapé:

```text
[ Fechar ]  [ Cancelar comanda ]                  [ Confirmar R$ 10,00 ]
```

- "Cancelar comanda" só aparece quando o diálogo está cobrando **uma única comanda existente** (não em cobrança avulsa/mesa direta sem comanda persistida, nem em cobrança agrupada de várias comandas — nesses casos o cancelamento individual deve ser feito pela fila do Salão).
- Desabilitado durante `isProcessing` do pagamento.

**2. Fluxo de cancelamento**

Ao clicar em "Cancelar comanda":
- Abre o `CancelComandaDialog` por cima do `PaymentDialog` (sem fechá-lo).
- O `PaymentDialog` permanece aberto mas com seus controles internos desabilitados enquanto o diálogo de cancelamento está aberto (overlay próprio do Radix já bloqueia interação).
- O usuário preenche motivo (≥20 chars), categoria e marca o checkbox "Cliente informado".
- Ao confirmar:
  - Botão "Confirmar cancelamento" entra em loading (`Cancelando...`) — sem freeze de tela.
  - Chama `cancelComandaMutation` do `use-pdv-comandas` com `{ id, reason, category, customerNotified }`.
  - Em sucesso: fecha `CancelComandaDialog`, fecha `PaymentDialog`, toast "Comanda cancelada".
  - Em erro: mantém ambos abertos, exibe toast de erro, libera os botões.

**3. Também no card da fila (escopo original)**

Para não perder o ponto de entrada principal: adicionar no `SalonQueueCard.tsx` um botão discreto **X** (ghost, vermelho) ao lado do botão "Cobrar" / chevron, que abre o mesmo `CancelComandaDialog`. Comportamento idêntico ao item 2.

### Detalhes técnicos

- `PaymentDialog` recebe novo prop opcional `onCancelComanda?: (comanda: Comanda) => void` ou gerencia o `CancelComandaDialog` internamente — preferir gerenciar internamente para não vazar lógica.
- Estado local: `const [cancelOpen, setCancelOpen] = useState(false)` + `const [isCancelling, setIsCancelling] = useState(false)`.
- Identificar a comanda alvo: usar o primeiro/único item de `comandas` se `comandas.length === 1` e `comandas[0].id` existir.
- Reaproveitar o `cancelComandaMutation` existente em `use-pdv-comandas.ts` (que será atualizado em outro passo para chamar a RPC `pdv_cancel_comanda`).
- Sem novos arquivos: apenas editar `PaymentDialog.tsx` e `SalonQueueCard.tsx`.

### Fora do escopo deste passo

- Implementação da migration `pdv_cancel_comanda` (já discutida).
- Substituição da mutation pelo RPC (será feito junto com a migration).
- Seção "Comandas canceladas" no relatório do caixa.