## Situação atual

O programa de fidelidade já registra pontos por pedido (`delivery_loyalty_points`), porém o cliente só descobre o saldo na **última etapa do checkout** (`OrderConfirmation.tsx`), via `LoyaltyBanner` + `LoyaltyRedeemSheet` (cashback). Não há visibilidade do saldo no cardápio nem acesso aos prêmios cadastrados.

Vamos resolver com duas adições, mantendo a identificação por telefone (sem login).

---

## 1. Saldo no header do cardápio público

Arquivo: `src/pages/PublicMenu.tsx` + `src/components/public-menu/PublicMenuHeader.tsx`

- Adicionar mini-fluxo de "Identificar-se" no header (botão "Meus pontos" quando o programa estiver ativo).
- Ao clicar, abrir um `Dialog` que pede o telefone, reaproveitando `useGetOrCreateCustomer` (mesma lógica do checkout) — sem criar fluxo de login novo.
- Persistir `customerId` + `phone` em `localStorage` (chave `pm:customer:<userId>`) para que o cardápio reabra já identificado nas próximas visitas.
- Quando identificado: renderizar `LoyaltyBanner` (já existe) no header com saldo + valor em cashback, mais botão "Ver prêmios" que abre a página/aba Meus Pontos.
- Quando `loyalty_settings.is_active === false`, esconder tudo.
- Reaproveitar essa identificação no `CheckoutFlow`: se já houver `customerId` salvo, pular o passo "phone".

## 2. Página/aba "Meus Pontos"

Nova rota: `/cardapio/:userId/meus-pontos` (componente `src/pages/PublicMenuLoyalty.tsx`, registrada em `src/App.tsx`).

Seções (todas usando tokens semânticos, sem cores customizadas):

- **Resumo**: saldo atual (`useCustomerPoints`), valor em cashback equivalente, regra "X pontos por R$ 1,00".
- **Prêmios disponíveis**: grid usando `useLoyaltyPrizes(userId)` filtrando `is_active`. Cada card mostra imagem, nome, custo em pontos e botão "Resgatar" (desabilitado se saldo < custo ou estoque esgotado).
- **Histórico**: lista das últimas movimentações em `delivery_loyalty_points` (earn/redeem) com data, descrição e sinal +/-.

Resgate de prêmio:

- Ao confirmar, chamar `useRedeemPoints` (já existe) registrando `points = -prize.points_cost`, `type='redeem'`, `reference_id = prize.id`, `description = 'Resgate: <nome>'`.
- Incrementar `delivery_loyalty_prizes.redeemed_count` (update via supabase client, respeitando o `max_quantity`).
- Como o prêmio é físico/entregue depois, mostrar um toast/modal "Resgate registrado — apresente este código ao receber o pedido" com um código curto (primeiros 8 chars do id do registro). Sem mudanças no fluxo de pedido — o gestor já visualiza o resgate em `RedemptionHistory`.
- Após resgate, invalidar `loyalty-points-balance` e `loyalty-prizes`.

## 3. Integração com o checkout existente

- `OrderConfirmation.tsx` continua oferecendo o **cashback** (resgate em desconto) no checkout. Não duplicaremos o resgate de prêmio físico ali — fica só na página Meus Pontos para evitar confusão de fluxo.
- Adicionar link "Ver prêmios" abaixo do `LoyaltyRedeemSheet` apontando para `/cardapio/:userId/meus-pontos`.

## 4. RLS / backend

Conferir e, se necessário, ajustar políticas:

- `delivery_loyalty_settings`, `delivery_loyalty_prizes`, `delivery_loyalty_points`: precisam permitir **SELECT público anônimo** filtrado por `user_id` (mesma lógica do cardápio público). Caso ainda esteja restrito a `auth.uid()`, criar migração com `policy "Public read for menu" for select using (true)` específica para os campos não sensíveis. Validar antes via `supabase--read_query` na pg_policies.
- Insert/update de `delivery_loyalty_points` e `redeemed_count` precisa ser permitido para anon (já é, pois o checkout público insere). Vamos confirmar.

## Arquivos previstos

```text
src/App.tsx                                              (rota nova)
src/pages/PublicMenu.tsx                                 (identificação persistida, header)
src/pages/PublicMenuLoyalty.tsx                          (novo)
src/components/public-menu/PublicMenuHeader.tsx          (botão Meus pontos + banner)
src/components/public-menu/LoyaltyIdentifyDialog.tsx     (novo — telefone)
src/components/public-menu/checkout/OrderConfirmation.tsx (link "Ver prêmios")
src/hooks/use-public-customer.ts                         (novo — wrapper localStorage)
supabase/migrations/*_loyalty_public_read.sql            (se RLS estiver restrito)
```

## Fora do escopo

- Login/cadastro real do cliente.
- Resgate de prêmio dentro do checkout (fica só em Meus Pontos).
- Ranking público (continua só no painel do gestor).
