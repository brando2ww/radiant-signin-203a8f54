Remover o campo "Outros meios" da Etapa 1 do dialog de fechamento de caixa, deixando apenas: Dinheiro, Crédito, Débito, PIX, Vale-refeição e Vendas a Prazo.

**`src/components/pdv/CloseCashierDialog.tsx`:**
1. Remover state `declaredOther`/`setDeclaredOther` e seu reset/hydration.
2. Remover `declaredOther !== ""` de `allBlindFilled`.
3. Remover `parseN(declaredOther)` de `blindTotal`.
4. Remover do payload de `submitBlindClosing` e do payload final (passar `null`/omitir).
5. Remover a linha "Outros meios" de `reviewRows` (Etapa 2).
6. Remover o `BlindInput` de "Outros meios" do grid da Etapa 1.

Sem mudanças no backend/hook/migration.