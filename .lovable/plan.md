## Objetivo
Suavizar o seletor Delivery/Retirada (de botões grandes para abas discretas) e aumentar a densidade de informação dos cards de pedido.

## Alterações

### 1. `src/components/delivery/OrdersTab.tsx`
- Remover o bloco com os dois botões grandes (🛵 Delivery / 🏪 Retirada).
- Manter cabeçalho ("Pedidos" + subtítulo dinâmico) e os 4 cards de stats filtrados pelo tipo (sem mudança).
- Passar `orderType` e `setOrderType` + `counts` para `<OrdersKanban />` para que as abas sejam renderizadas dentro do header do kanban.
- Remover import de `cn` se não usado.

### 2. `src/components/delivery/OrdersKanban.tsx`
- Receber novas props `orderType`, `onOrderTypeChange`, `counts: { delivery: number; pickup: number }`.
- Acima da grade do kanban, adicionar um header com `Tabs` (shadcn) discretas:
  - `<Tabs value={orderType} onValueChange={...}>`
  - `<TabsList>` com `<TabsTrigger value="delivery">🛵 Delivery <Badge>{counts.delivery}</Badge></TabsTrigger>` e equivalente para `pickup`.
- Manter layout horizontal das colunas + coluna lateral de Concluídos.
- Aumentar largura das colunas de `w-[280px]` para `w-[320px]` para acomodar cards maiores.

### 3. `src/components/delivery/OrderCard.tsx` — cards maiores e mais informativos
Estrutura redesenhada (mais respiração, padding `p-4`, `space-y-3`):

1. **Header**: número grande (`text-lg font-bold`) "#0024" + badge tipo (🛵 Delivery / 🏪 Retirada) à direita.
2. **Cliente + tempo**: nome em destaque (`font-semibold text-sm`); abaixo, tempo decorrido com ícone de relógio e cor progressiva (verde <15min, amarelo <30min, vermelho ≥30min). Atualiza a cada 30s via `setInterval`.
3. **Itens**: lista compacta dos primeiros **3 itens** (`{qtd}x {nome}` truncado) + "+N mais" se houver. Borda superior sutil.
4. **Pagamento**: ícone (`CreditCard`/`Banknote`/`QrCode` conforme `payment_method`) + label legível (Dinheiro, Cartão, Pix etc.).
5. **Entrega/Contato**:
   - Delivery: linha com `MapPin` + endereço (`delivery_address_text` truncado em 1 linha). Linha do entregador: nome com ícone `Bike` se atribuído, senão `<AssignDriverPopover />` quando status ∈ {ready, delivering}.
   - Retirada: telefone clicável (`tel:`) com ícone `Phone`.
6. **Total** em destaque (`text-lg font-bold`) à esquerda do rodapé.
7. **Ações** (rodapé):
   - Botão principal full-width: avança status (`Confirmar` para `pending`→`preparing`, `Marcar como Pronto`, `Saiu para Entrega`, `Concluir`). Usa `useUpdateOrderStatus`.
   - Botão secundário "Detalhes" (`variant="ghost"`, `size="sm"`) abaixo, abre `OrderDetailDialog`.
8. **Indicadores de urgência** mantidos: borda pulsante destrutiva quando `pending >5min`, anel amarelo quando `ready >10min`.

Helper local `paymentLabel(method)` mapeando códigos para texto pt-BR.

### 4. (sem mudança) `OrdersKanban` mantém a coluna lateral compacta de Concluídos com filtro de data.

## Notas técnicas
- Usa apenas tokens do design system; cores semafóricas (verde/amarelo/vermelho) somente no timer e bordas de urgência (semântica de status).
- Sem novas migrations.
- Aria + locale ptBR mantidos.

## Resultado esperado
- Topo da página limpo (apenas título + 4 cards de stats).
- Abas Tabs sutis "🛵 Delivery (N)" / "🏪 Retirada (N)" no header do kanban.
- Cards maiores mostram número, tipo, cliente, timer colorido, 3 itens, pagamento, endereço/entregador ou telefone, total, e botão principal de avanço.