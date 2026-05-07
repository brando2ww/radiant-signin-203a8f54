Remove the "Tipo" column from the movements table in `src/components/pdv/CashMovementsList.tsx`.

Changes:
- Remove `<TableHead>Tipo</TableHead>` from the header.
- Remove the corresponding `<TableCell>` containing the type Badge (Venda/Sangria/Reforço/Entrada) and the Delivery badge.
- Move the "Delivery" / "Delivery (online)" badge into the "Descrição" cell (inline next to the description) so the delivery indicator is preserved.
- Remove now-unused `TYPE_CONFIG` and related icon imports (`ArrowDown`, `ArrowUp`).
- Keep type-driven sign/color on the Valor cell (sangria stays red with `-`, others green with `+`).
- Keep payment method column unchanged.