# Aumentar legibilidade da comanda do delivery

A impressão está saindo fraca. Vou ajustar o template HTML da comanda do motoboy (`src/lib/print-motoboy-receipt.ts`) para imprimir com mais contraste e peso.

## Mudanças no CSS de impressão

- `body`: `font-weight: bold` global e `color: #000`, garantindo que todo texto saia em negrito (impressoras térmicas rendem bem mais escuro com bold).
- `font-size` base aumentada de 12px para 13px.
- `-webkit-print-color-adjust: exact` e `print-color-adjust: exact` para forçar renderização fiel.
- Trocar fonte `Courier New` por `'Courier New', monospace` mantida, mas com `letter-spacing: 0.3px` para evitar caracteres "lavados".
- Aumentar peso das bordas tracejadas (`border-top: 2px dashed #000`).
- Itens secundários (`.opt`, `.notes`, `.sub`) sobem para 12px e mantêm bold.
- `.total` vai para 16px, `.order-number` para 18px.

Sem mudanças em lógica, dados ou outros arquivos.

## Arquivo afetado

- `src/lib/print-motoboy-receipt.ts`
