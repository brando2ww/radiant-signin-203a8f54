## Trocar o Sheet do "Pagamento na entrega" por um Dialog no padrão do salão

O `DeliveryPaymentDialog` atual usa um `Sheet` lateral pequeno. Vou refazer como um `Dialog` no mesmo padrão do `PaymentDialog` do salão: dialog centralizado, em duas colunas, com seletor de forma de pagamento em grid de ícones, atalhos de valor rápido para dinheiro e troco em destaque.

### Mudanças

**`src/components/pdv/cashier/DeliveryPaymentDialog.tsx`** — reescrever:
- Trocar `Sheet` por `Dialog` (`max-w-2xl`).
- Header com ícone, título "Pagamento na entrega" e descrição com `#numero · cliente`.
- Layout em duas colunas:
  - **Esquerda (resumo)**: itens, subtotal, taxa de entrega, desconto, **Total** em destaque — em `bg-muted/30` com `ScrollArea`.
  - **Direita (forma de pagamento)**:
    - Grid 2/3 colunas com cards clicáveis: Dinheiro, Crédito, Débito, PIX, VR/VA (mesmo visual do `PaymentDialog`: ícone + label, borda primária quando ativo).
    - Se Dinheiro: `CurrencyInput` grande, botões rápidos (R$ 50, 100, 150, 200, "Valor exato"), troco grande, saldo da gaveta, validação `change > drawerBalance` com texto destrutivo.
    - Se outro método: card informativo "Confirmar recebimento de R$ X via {método}".
- Footer fixo com Cancelar / Confirmar pagamento.
- Mantém integração com `usePDVDeliveryCheckout.registerDeliveryPayment` (já implementado).

Sem outras mudanças — o `SalonQueuePanel` já abre esse dialog, só muda a apresentação.