## Mostrar resposta/comentário de cada cliente nas tabelas de "Análise por Pergunta"

Hoje as tabelas dos painéis por pergunta (Notas, Múltipla escolha) mostram só Data, Nota/Opção e Cliente. O comentário individual deixado pelo cliente fica oculto, mesmo já vindo do hook `useCampaignQuestionAnalytics` (campos `comment` e `text_answer`).

### Mudança

Adicionar uma coluna **"Resposta"** (ou "Comentário") nas tabelas dos painéis, exibindo:
- `comment` quando existir
- senão `text_answer` quando existir
- senão `—`

Texto longo deve quebrar linha; manter a tabela responsiva (scroll horizontal já existe).

### Arquivos

1. **`src/components/evaluations/reports/per-question/QuestionPanelStars.tsx`**
   - Adicionar `<th>Resposta</th>` ao lado de Cliente
   - Adicionar `<td>` exibindo `r.comment || r.text_answer || "—"` com classes para quebra de linha (`whitespace-pre-wrap break-words max-w-md`)

2. **`src/components/evaluations/reports/per-question/QuestionPanelChoice.tsx`**
   - Mesma adição na tabela de respostas (coluna "Comentário" ao final)

O painel de texto livre (`QuestionPanelText`) já mostra o texto, então não precisa alteração — a menos que você queira revisar.

### Fora de escopo

- Não alterar lógica de KPIs, gráficos, ordenação ou paginação.
- Não mexer no hook nem no schema.
