## Mostrar o comentário geral da avaliação (`nps_comment`) na coluna "Resposta"

### Diagnóstico

Os campos `comment`/`text_answer` em `evaluation_answers` quase nunca são preenchidos para perguntas do tipo **stars** — neste tipo o cliente só dá a nota. O texto que o cliente escreve fica em `customer_evaluations.nps_comment` (campo no nível da avaliação inteira, não da pergunta).

Por isso a coluna "Resposta" aparece toda como "—".

### Mudança

1. **`src/hooks/use-campaign-question-analytics.ts`**
   - Incluir `nps_comment` no `select` de `customer_evaluations`.
   - Adicionar `nps_comment: string | null` na interface `QuestionAnswer`.
   - Propagar o valor ao montar cada answer.

2. **`src/components/evaluations/reports/per-question/QuestionPanelStars.tsx`**
   - Coluna "Resposta" passa a exibir `r.comment || r.text_answer || r.nps_comment || "—"`.

3. **`src/components/evaluations/reports/per-question/QuestionPanelChoice.tsx`**
   - Coluna "Comentário" passa a exibir `r.comment || r.nps_comment || "—"`.

### Fora de escopo
- Não muda KPIs, gráficos, ordenação ou paginação.
- Painel de texto livre não precisa alteração.
