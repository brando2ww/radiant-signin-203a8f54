## Adicionar tipo de pergunta "Texto livre" nas campanhas de Avaliações

### 1. Banco de dados (migração)

Adicionar colunas em `evaluation_campaign_questions`:
- `placeholder text` — texto de exemplo da caixa
- `is_required boolean DEFAULT false` — resposta obrigatória
- `max_length integer DEFAULT 500` — limite de caracteres

Adicionar coluna em `evaluation_answers`:
- `text_answer text` — resposta digitada pelo cliente

Sem alteração de RLS (políticas existentes cobrem as novas colunas).

### 2. Configuração da campanha (admin)

`src/components/pdv/evaluations/QuestionFormDialog.tsx`:
- Novo tipo `free_text` no array `QUESTION_TYPES` (ícone `MessageSquare`, descrição "Cliente escreve livremente").
- Novos campos quando `type === 'free_text'`:
  - Input "Placeholder" (opcional, maxLength 100)
  - Switch "Resposta obrigatória" (default off)
  - Input numérico "Tamanho máximo" (default 500, max 2000)
- `canSubmit`: para `free_text` exige apenas texto da pergunta (sem opções).
- Pré-visualização: textarea desabilitada com o placeholder configurado e contador discreto.

`src/components/pdv/evaluations/CampaignQuestionManager.tsx`:
- Adicionar entrada em `QUESTION_TYPE_LABELS` para `free_text` (ícone `MessageSquare`, label "Texto livre").
- Repassar/aceitar os novos campos `placeholder`, `is_required`, `max_length` no fluxo de criar/editar.

`src/hooks/use-evaluation-campaigns.ts`:
- Tipos e mutations (create/update) aceitam `placeholder`, `is_required`, `max_length`.
- No mapping enriquecido das respostas, propagar esses campos.

### 3. Formulário público (`src/pages/PublicEvaluation.tsx` + `src/hooks/use-public-evaluation.ts`)

- `usePublicCampaignQuestions` deve trazer também `question_type`, `placeholder`, `is_required`, `max_length` (já trazia; confirmar no select).
- Estado `answers[questionId]` ganha campo `textAnswer: string`.
- Renderização para `qType === 'free_text'`:
  - Título com sufixo "(opcional)" quando não obrigatória.
  - `<Textarea>` com placeholder configurado e `maxLength={max_length}`.
  - Contador "X/MAX" discreto abaixo.
  - Validação inline "Por favor, responda esta pergunta" se obrigatória e vazia ao tentar enviar.
- `allQuestionsAnswered`/`progress` consideram texto preenchido (quando obrigatória) ou sempre verdadeiro (quando opcional).
- Submit envia `text_answer` no payload de `evaluation_answers` (score = 0, selected_options = null).

`useSubmitCampaignEvaluation` (em `use-evaluation-campaigns.ts`): aceitar e gravar `text_answer` em cada answer.

### 4. Relatórios / Respostas

`src/components/evaluations/AnswerValue.tsx`:
- Novo branch para `type === 'free_text'`: renderizar a string `text_answer` em bloco citável (como o `comment` atual, ícone `MessageSquare`). Sem médias nem gráficos.

`src/hooks/use-evaluation-report-helpers.ts`:
- Mapa de info de pergunta inclui `type === 'free_text'` (já genérico — apenas garantir que não seja agregado em médias).

Componentes de agregação (`NpsPerQuestion`, dashboards): pular perguntas `free_text` ao calcular médias/gráficos.

Exportação CSV (onde existir, ex. `src/lib/export-utils.ts` se aplicável a respostas): incluir coluna com `text_answer` quando o tipo for `free_text`.

### Detalhes técnicos

- Novas colunas são nullable / com defaults seguros para não quebrar perguntas existentes.
- Tipo `question_type` continua `text` (sem enum), aceitando o valor `'free_text'`.
- Score gravado como 0 e `selected_options` como `null` para respostas de texto, mantendo a constraint `score >= 0 AND score <= 10`.
- Validação client-side com `maxLength` no `<Textarea>`; sanitização padrão do React (sem `dangerouslySetInnerHTML`).