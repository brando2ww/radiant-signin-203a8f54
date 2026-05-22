# Lançar prêmio resgatado em uma comanda

Hoje, ao validar um cupom no modo "standalone" (botão Cupons F6), apenas marcamos como resgatado — o operador precisa "lembrar" de entregar. Vou adicionar um passo opcional de **lançar o prêmio direto em uma comanda aberta**.

## Fluxo proposto (UX)

Após validar o cupom (status `active`) no `RedeemCouponDialog`:

1. Em vez de só "Marcar como resgatado", mostrar **dois botões**:
   - **"Lançar em comanda"** (primário)
   - **"Apenas marcar como resgatado"** (secundário, comportamento atual)

2. Ao clicar em **Lançar em comanda**, expandir um seletor inline com:
   - Combobox/Select com as comandas abertas (mesa + nome do cliente + nº comanda).
   - Botão "Confirmar lançamento".

3. Ao confirmar:
   - Se `reward_type === "free_product"` **e** existir `reward_product_id` → busca o produto, faz `addItem` com `unit_price = 0`, `notes = "🎁 Cupom {code} — {prize_name}"`.
   - Se `reward_type === "manual"` ou `free_product` sem produto vinculado → adiciona uma **observação na comanda** via `addItem` com produto fictício/observação (ver alternativa abaixo) **ou** insere uma linha em `pdv_comandas` como nota.
   - Se `reward_type === "percent"`/`"fixed"` → não lança item (esses são descontos no pagamento), mas mostra dica: "Esse cupom é desconto — aplique na hora do pagamento (F7)".
   - Em todos os casos onde o lançamento aconteceu, chama `useRedeemCouponForPDV` para marcar resgatado e fecha o dialog.

### Decisão sobre prêmios manuais sem produto vinculado
Como `pdv_comanda_items` exige `product_id`, para prêmios manuais não posso simplesmente "anotar" sem produto. Duas opções:
- **(A)** Só permitir "Lançar em comanda" quando houver `reward_product_id`. Para `manual` puro, manter só "Marcar como resgatado" + toast pedindo entrega manual.
- **(B)** Criar/buscar um produto "Brinde / Cortesia" do tenant e usar como placeholder.

**Vou adotar (A)** — mais simples e seguro, sem mexer no catálogo. Para `manual`, mantém o fluxo atual.

## Arquivos a alterar

### 1. `src/hooks/use-coupon-redemption.ts`
Adicionar mutation `useLaunchCouponOnComanda`:
- Input: `{ winId, comandaId, productId, prizeName, couponCode }`
- Busca o produto (nome, preço atual — usado só para validar existência).
- Insere em `pdv_comanda_items` com `unit_price=0`, `quantity=1`, `subtotal=0`, `notes` com prefixo de cortesia.
- Reaproveita lógica simples (não preciso de `expandComposition` aqui — produto cortesia normalmente é simples; se virar problema, adiciono depois).
- Marca o win como resgatado na mesma chamada (mesma transação client-side: se o insert falhar, não marca).
- Invalida `["pdv-comandas"]`, `["all-prize-wins"]`, `["campaign-prize-wins"]`.

### 2. Novo hook leve `useOpenComandasForSelect` (ou reaproveitar existente)
Verificar se `use-pdv-comandas` já expõe lista de abertas; se sim, reusar. Se não, criar query simples: comandas com `status in ('aberta','aguardando_pagamento')` do tenant, com join para mesa e nome do cliente.

### 3. `src/components/pdv/cashier/RedeemCouponDialog.tsx`
- Quando `result.status === "active"`:
  - Se `reward_type === "free_product"` e `reward_product_id` presente → mostrar bloco "Lançar em comanda" com Select de comandas + botão.
  - Senão → manter botões atuais.
- Adicionar estado `selectedComandaId` e handler `handleLaunch`.
- Após sucesso: toast "Prêmio lançado na comanda X" + fecha dialog.

## Fora de escopo
- Não cria produto "Cortesia" automaticamente.
- Não toca em mesas (apenas comandas, que já carregam a mesa).
- Não muda o fluxo de desconto no `PaymentDialog`.
- Sem integração com cozinha além do que `addItem` já faz (production_center).
