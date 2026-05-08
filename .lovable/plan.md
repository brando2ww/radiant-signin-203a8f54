## Problema

No modal de Pagamento, na aba "Várias formas", ao escolher "Cartão" em uma das linhas não aparece o seletor de Crédito/Débito (que existe no modo "Tudo"). Isso já é exigido pela conferência do fechamento, e o código de submit já lê `line.cardType` — mas a UI nunca permite definir esse valor por linha.

## Solução (apenas UI, em `src/components/pdv/cashier/PaymentDialog.tsx`)

1. No card de cada `splitPayment` (dentro do bloco `splitEnabled`, após o `<Select>` de forma e antes do `CurrencyInput`), renderizar condicionalmente, quando `payment.method === "cartao"`, um toggle compacto com dois botões — "Crédito" e "Débito" — no mesmo padrão visual do toggle já usado no modo "Tudo" (linhas ~1798-1845).
   - Botão ativo: `border-primary bg-primary/10`.
   - `onClick` chama `updateSplitPayment(payment.id, { cardType: "credito" | "debito" })`.
   - Valor exibido: `payment.cardType ?? "credito"`.

2. Ao trocar a forma da linha para "cartao" (no `onValueChange` do Select existente), inicializar `cardType: "credito"` se ainda não houver valor:
   - `updateSplitPayment(payment.id, { method: v, cardType: v === "cartao" ? (payment.cardType ?? "credito") : payment.cardType })`.

3. Em `addSplitPayment` (linha ~469), manter o default já existente; nenhuma mudança necessária além de garantir que o `cardType` permaneça opcional.

Sem mudanças em hooks, payload, validação ou lógica de submit — o caminho `line.method === "cartao" ? (line.cardType === "debito" ? "debito" : "credito")` (linhas 617-618) já consome o novo valor corretamente.

## Resultado esperado

Ao selecionar "Cartão" em qualquer linha de "Várias formas", aparecem dois botões Crédito/Débito logo abaixo do seletor de forma, permitindo registrar corretamente cada split na conferência do fechamento.
