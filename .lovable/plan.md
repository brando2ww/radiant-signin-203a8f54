Prevent the "Valor" column from wrapping in `src/components/pdv/CashMovementsList.tsx`:

- Add `whitespace-nowrap w-[140px]` to the "Valor" `TableHead`.
- Add `whitespace-nowrap` to the value `TableCell` so the sign + amount stay on one line.