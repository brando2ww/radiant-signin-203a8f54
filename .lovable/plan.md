## Redirecionamento automático ao Google configurável por campanha

### Objetivo
Permitir que cada campanha de avaliação escolha quando o cliente é encaminhado ao Google ao finalizar a avaliação, e garantir que ele continue recebendo o cupom da roleta antes do redirecionamento.

### Comportamento desejado
- O link do Google Reviews continua vindo de **Configurações → Avaliação Google** (`business_settings.google_review_url`). Sem mudanças nessa tela.
- Cada campanha terá uma nova opção **"Encaminhar ao Google ao final"** com três modos:
  - **Desativado** — nunca redireciona.
  - **Apenas promotores (NPS 9–10)** — comportamento atual (padrão para campanhas existentes).
  - **Sempre** — todo cliente é redirecionado ao final.
- Quando o cliente ganha cupom na roleta, ele **vê o cupom primeiro** e só depois é encaminhado ao Google (hoje o cupom é pulado para promotores).

### Mudanças

1. **Banco** — migration adicionando coluna em `evaluation_campaigns`:
   - `google_redirect_mode text not null default 'promoters'` com check `in ('off','promoters','always')`.
   - Backfill implícito pelo default mantém o comportamento atual.

2. **`src/hooks/use-evaluation-campaigns.ts`**
   - Adicionar `google_redirect_mode` à interface da campanha, ao `select`, ao `insert` (default `'promoters'`) e ao update.

3. **`src/components/pdv/evaluations/EditCampaignDialog.tsx`** (ou onde estão os campos de edição da campanha)
   - Novo `Select` "Encaminhar ao Google ao final" com as 3 opções, exibindo aviso quando `google_review_url` não estiver configurado e linkando para Configurações.

4. **`src/pages/PublicEvaluation.tsx`** — ajustar o `onSuccess` em `submitEvaluation` (linhas 222–252):
   - Calcular `shouldRedirect` com base em `campaign.google_redirect_mode` + presença de `googleReviewUrl`:
     - `off` → nunca
     - `promoters` → `npsScore >= 9`
     - `always` → sempre
   - Fluxo unificado: se ganhou cupom, vai para `coupon`; se não, vai para `done`. A tela de cupom (`PrizeResult`) e a tela `done` passam a receber `redirectUrl` opcional e exibem um botão "Avaliar no Google" + auto-redirect após alguns segundos quando presente.
   - Remover o atalho que pula o cupom para promotores.

5. **`src/components/public-evaluation/PrizeResult.tsx`** e bloco da fase `done` em `PublicEvaluation.tsx`
   - Aceitar prop `googleReviewUrl?: string`. Quando presente, mostrar CTA "Avaliar no Google" e disparar `window.location.href = url` após ~6s (com botão "Pular").
   - Reaproveitar a UI do componente `GoogleRedirectScreen` existente (ou extrair um sub-componente) para manter consistência visual.

### Fora de escopo
- Não mexer no link global do Google em Configurações.
- Não alterar lógica de NPS, roleta de prêmios, KPIs ou relatórios.
- Sem mudanças no painel de respostas/leads.