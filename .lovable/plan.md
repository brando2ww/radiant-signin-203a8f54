## Objetivo

Atualmente o status "Aberto/Fechado" do delivery depende apenas do toggle manual `is_open` em `delivery_settings`. O horário configurado em `business_hours` é salvo mas nunca consultado — então a loja fica aberta 24h se o lojista esquecer de fechar. Vamos fazer o cardápio público respeitar automaticamente o horário e bloquear pedidos fora dele.

## Mudanças

### 1. Novo utilitário `src/lib/delivery-hours.ts`

Função `isStoreCurrentlyOpen(settings)` retornando `{ open: boolean, reason: 'manual_closed' | 'outside_hours' | 'open', nextOpenLabel?: string }`.

Regras (em horário de Brasília — `America/Sao_Paulo`):
- Se `is_open === false` → fechado (override manual).
- Calcula dia da semana atual (`monday`..`sunday`) e hora atual.
- Lê `business_hours[day]`. Se ausente ou `closed === true` → fechado.
- Compara `open <= now < close` (HH:MM). Suporta intervalos que cruzam meia-noite (ex.: `18:00`–`02:00`) verificando também o dia anterior.
- Quando fechado, calcula próximo horário de abertura para mostrar ao cliente ("Abre segunda às 18:00").

### 2. `PublicMenuHeader.tsx`

- Substituir a checagem `deliverySettings?.is_open` pelo helper.
- Badge: "Aberto agora" (verde) quando aberto; "Fechado" (destrutivo) com texto auxiliar do próximo horário quando fechado.

### 3. `ShoppingCart.tsx`

- Consumir o helper a partir de `settings`.
- Quando fechado: 
  - Mostrar aviso no topo do carrinho ("Loja fechada — não é possível finalizar pedidos agora. Abre <próximo horário>").
  - Desabilitar o botão "Finalizar Pedido".
  - Não abrir o `CheckoutFlow`.
- Manter visualização do carrinho permitida (cliente pode montar pedido para depois).

### 4. `CheckoutFlow.tsx` (defesa em profundidade)

- No início do submit final, revalidar com o helper. Se fechado, exibir `toast.error` e abortar antes de criar o pedido.

### Não incluso

- Não alteramos o backend/RLS — a validação fica client-side por enquanto, suficiente para o caso de uso (cliente não verá CTA fora do horário). Se quiser bloqueio server-side via trigger no `delivery_orders`, podemos adicionar depois.
- Não mexemos no toggle manual `is_open` nem em `BusinessHoursSettings`.
- Sem mudanças em pedidos via PDV/garçom (operação interna).

### Arquivos afetados

- novo: `src/lib/delivery-hours.ts`
- editado: `src/components/public-menu/PublicMenuHeader.tsx`
- editado: `src/components/public-menu/ShoppingCart.tsx`
- editado: `src/components/public-menu/CheckoutFlow.tsx`
