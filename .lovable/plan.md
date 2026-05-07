## Layout full-width na página de Pedidos Delivery

### `src/pages/pdv/delivery/Orders.tsx`
- Trocar `container mx-auto py-6 px-4` por `w-full py-6 px-4` para remover o `max-width` do container.

### `src/components/delivery/OrdersKanban.tsx`
- Wrapper das colunas: trocar `flex gap-4` por `flex gap-4 w-full`.
- Remover `overflow-x-auto` da div interna (não há mais scroll horizontal).
- Cada Card de coluna do kanban: remover `w-[320px] shrink-0` e usar `flex-1 min-w-0` para distribuir igualmente o espaço disponível.
- Card "Concluídos": manter fixo à direita com `w-[280px] shrink-0` (já é shrink-0; só ajustar largura de 260 → 280).

Resultado: o kanban preenche 100% da largura útil; coluna Concluídos tem 280px fixos; demais colunas dividem o restante igualmente; sem scroll horizontal.