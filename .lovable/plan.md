## Objetivo

Permitir que, ao lançar um prêmio em comanda, o operador escolha entre:
1. **Lançar como item livre** (R$ 0,00 com o texto do prêmio como nome — sem precisar vincular produto)
2. **Buscar e vincular um produto** do catálogo (fluxo atual)

## Mudanças

### `RedeemCouponDialog.tsx`

- Adicionar um seletor (RadioGroup ou Tabs) com duas opções:
  - **"Lançar texto do prêmio"** (padrão) — usa `result.reward_description` ou `result.prize_name` como nome do item
  - **"Escolher produto do catálogo"** — mostra o campo de busca + Select atual
- Estado novo: `launchMode: "text" | "product"`
- Validação do botão "Lançar":
  - modo `text`: habilitado se houver texto do prêmio
  - modo `product`: habilitado apenas se `selectedProductId` preenchido
- Resetar `launchMode` para `"text"` ao abrir o dialog / trocar aba

### `use-coupon-redemption.ts` — `useLaunchCouponOnComanda`

- Tornar `productId` opcional nos parâmetros
- Aceitar novo parâmetro `customName?: string`
- Ao inserir em `pdv_comanda_items`:
  - Se `productId` informado → mantém fluxo atual (busca produto, usa nome + 🎁)
  - Se apenas `customName` → insere item com `product_id: null`, `product_name: "🎁 " + customName`, `unit_price: 0`, `quantity: 1`
- Resto do fluxo (marcar `campaign_prize_wins` como resgatado, invalidar queries) permanece igual

## Detalhes técnicos

- Verificar se `pdv_comanda_items.product_id` aceita `NULL` antes de implementar. Se não aceitar, será necessária uma migration (`ALTER COLUMN product_id DROP NOT NULL`) — confirmarei isso no início da implementação.
- Nenhuma mudança visual além do seletor de modo dentro do bloco "Prêmio manual".
