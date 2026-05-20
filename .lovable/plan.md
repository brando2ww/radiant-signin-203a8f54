## Problema

Na tela do cupom (após ganhar prêmio), o botão "Avaliar no Google" aparece mas não redireciona automaticamente — depende do clique do usuário. Falta um contador regressivo que leve o cliente para o Google Reviews.

## Solução

Em `src/pages/PublicEvaluation.tsx`, dentro do bloco `currentPhase === "coupon"` (quando `pendingRedirect && googleReviewUrl`):

1. Adicionar `useEffect` com contador de 5 segundos (`useState` para `secondsLeft`).
2. Quando o contador chegar a 0, executar `window.location.href = googleReviewUrl`.
3. Atualizar o texto/botão para refletir o countdown:
  - Texto: "Redirecionando para o Google em **Xs**..."
  - Botão principal: "Avaliar no Google agora" (clique imediato, cancela o timer).
  - Botão secundário (link/ghost): "Pular" — cancela o timer e mantém a tela do cupom.
4. Limpar o timer no unmount e ao clicar em qualquer botão (evita redirect duplicado).

Sem mudanças em lógica de negócio, hooks de dados ou outros fluxos. Apenas adição de UI/efeito no bloco `coupon`.

## Arquivos

- `src/pages/PublicEvaluation.tsx` — adicionar estado de contador, `useEffect` de redirect automático e ajustar bloco visual entre linhas 280-293.