## Adicionar toggle de auto-confirmação na aba Notificações

A aba Notificações em `/pdv/delivery/configuracoes` renderiza o componente `NotificationPreferences`, que hoje só tem Sonoro/E-mail/WhatsApp. O toggle de auto-confirmação está em outro componente não usado (`NotificationSettings.tsx`).

## Mudança

Editar `src/components/delivery/settings/NotificationPreferences.tsx`:

- Importar `useDeliverySettings` e `useCreateOrUpdateSettings`.
- Adicionar um novo Card **"Confirmação Automática de Pedidos"** acima do card existente, com:
  - Switch lendo `settings.auto_accept_orders`.
  - Ao alternar, chama `updateSettings.mutate({ auto_accept_orders: checked })` (salvamento imediato, sem botão Salvar).
  - Descrição explicando que o pedido é confirmado, baixa estoque e dispara impressão automaticamente.

A lógica de auto-confirmação no listener realtime (`use-delivery-orders.ts`) já está implementada, então o toggle passa a funcionar de fato.
