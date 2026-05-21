## Remover campo "Online (Delivery)" da Etapa 1

Pagamentos online de delivery são contabilizados automaticamente pelo sistema, então não devem aparecer na apuração às cegas nem na conferência.

### Alterações em `src/components/pdv/CloseCashierDialog.tsx`

1. **Etapa 1 (grid de apuração):** remover o `BlindInput` de "Online (Delivery)".
2. **Estado:** remover `declaredOnline` / `setDeclaredOnline` e seu reset.
3. **`allBlindFilled`:** remover a checagem `declaredOnline !== ""`.
4. **`blindTotal`:** remover `parseN(declaredOnline)` da soma.
5. **`submitBlindClosing`:** não enviar mais o valor declarado de online (passar `null`/omitir, mantendo o comportamento automático no backend).
6. **`reviewRows` (Etapa 2):** remover a linha de conferência de "Online (Delivery)".

Os demais 7 meios (Dinheiro, Crédito, Débito, PIX, Vale-refeição, Outros, Vendas a Prazo) continuam sempre visíveis e obrigatórios.

Nenhuma mudança em hooks, migrations, backend ou impressão.