## Contexto

A base já existe:
- Campo **Link do Google Reviews** já está em `Configurações de Avaliações` (`user_settings.google_review_url`).
- Em `PublicEvaluation.tsx` já existe um botão *"Avaliar no Google"* na tela final quando NPS ≥ 9.

O que falta para fechar o pedido:
1. Tornar o redirecionamento **automático** (não depender do clique).
2. Para promotores (NPS 9-10), **não mostrar a tela de cupom/sorteio** — substituir pelo CTA do Google.
3. Manter o fluxo atual (cupom/roleta) intacto para neutros e detratores.

## Mudanças

### 1. `src/pages/PublicEvaluation.tsx` — desviar antes da fase `coupon`

No ponto onde decidimos a próxima fase após enviar a avaliação (hoje vai para `coupon` se ganhou prêmio, senão `done`):

- Calcular `isPromoter = npsScore >= 9 && !!googleReviewUrl`.
- Se `isPromoter`:
  - Pular completamente a fase `coupon` (mesmo que tenha sorteio configurado).
  - Ir direto para uma nova micro-fase visual `google_redirect` (ou reutilizar `done` com um flag).
  - Não emitir/atribuir cupom para esses casos (alinhado à escolha do usuário).
- Se NÃO promotor: fluxo atual permanece (cupom → done).

### 2. Tela do promotor — redirecionamento automático

Substituir o bloco atual de "Avaliar no Google" por uma tela dedicada:

- Ícone + mensagem: *"Que bom que você gostou! 🎉 Vamos te levar ao Google para deixar sua avaliação..."*
- Contador regressivo de **3 segundos** visível.
- Ao zerar: `window.location.href = googleReviewUrl` (mesma aba — funciona melhor em mobile que `window.open`, que costuma ser bloqueado por pop-up blockers em iOS Safari).
- Botão secundário **"Ir agora"** (atalho que dispara o redirect imediato).
- Link discreto **"Pular"** que troca a fase para `done` simples (apenas agradecimento).

### 3. Backend — sem cupom para promotor

No fluxo de submissão da avaliação, quando `isPromoter && googleReviewUrl` definido:
- Não chamar a lógica de sorteio/atribuição de cupom.
- A avaliação em si (`customer_evaluations` + `evaluation_answers`) continua sendo gravada normalmente.

### 4. Settings — pequeno ajuste de copy (opcional, sem mudança de schema)

Em `EvaluationsSettings.tsx`, atualizar o texto explicativo:

> *"Quando o cliente der nota 9 ou 10 no NPS, ele será **redirecionado automaticamente** para avaliar no Google e **não receberá cupom de sorteio** (o incentivo passa a ser a avaliação pública)."*

## Detalhes técnicos

- Nenhuma migração de banco necessária — `google_review_url` já existe em `user_settings`.
- Validação leve do URL no save (já existente): se vazio, o fluxo cai de volta no comportamento antigo (cupom + tela "Obrigado").
- Acessibilidade: `aria-live="polite"` no contador para leitores de tela; respeitar `prefers-reduced-motion` removendo a animação fade do contador.
- Mobile-first: usar `window.location.href` em vez de `window.open` para evitar pop-up blockers.

## Fora de escopo

- Postar a estrela diretamente no Google (não é permitido pela API do Google — todo restaurante usa o mesmo padrão de redirecionar para `writereview?placeid=...`).
- Métricas de conversão "abriu o Google → realmente avaliou" (Google não expõe esse callback). Podemos discutir um proxy depois, se quiser.
