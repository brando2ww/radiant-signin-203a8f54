# Análise Por Pergunta — Relatórios de Avaliações

Nova subseção dentro de Relatórios para analisar individualmente cada pergunta de uma campanha, com painéis adaptados ao tipo (nota / múltipla escolha / texto livre).

## 1. Navegação

- Adicionar item **"Por Pergunta"** (ícone `MessageSquare`) na seção "Relatórios" do `EvaluationsLayout.tsx`, após Mensal.
- Nova rota: `/pdv/avaliacoes/relatorios/por-pergunta` → `ReportPerQuestion.tsx`.

## 2. Estrutura da página (`ReportPerQuestion.tsx`)

**Filtros globais no topo (sticky):**
- Seletor de campanha (`Select` com lista de `useEvaluationCampaigns`)
- Seletor de período: presets (7 dias, 30 dias, mês atual) + range personalizado (`DatePickerWithRange`)
- Ambos filtros propagam para todos os painéis da página

**Lista de perguntas:**
- Cards-resumo (uma linha cada) com: texto da pergunta, tipo (badge), total de respostas e indicador-chave (NPS / opção dominante / "n respostas")
- Padrão accordion: clicar expande o painel completo abaixo. Múltiplos podem ficar abertos.
- Ordem: respeita `order_position` da pergunta na campanha

## 3. Painéis por tipo

Componentes em `src/components/evaluations/reports/per-question/`:

### Tipo "stars" / nota → `QuestionPanelStars.tsx`
- **KPIs (3 cartões):** NPS calculado em número grande + classificação (Excelente ≥75 / Ótimo ≥50 / Bom ≥0 / Ruim <0); Total de respostas; Média (ex: `4.7 / 5`)
- **Distribuição:** três blocos coloridos (Promotores 9-10 verde / Neutros 7-8 amarelo / Detratores 0-6 vermelho) com quantidade, %, barra de progresso
- **Evolução:** `AreaChart` (recharts) do NPS/média ao longo do período, agrupado por dia
- **Tabela paginada (20/página):** data, nota, nome do cliente, ordenável por data e nota
- Adapta cortes para escala 1-5 quando a pergunta usar estrelas (Promotores 5, Neutros 4, Detratores ≤3); detectado pelo valor máximo observado

### Tipo "multiple_choice" / "single_choice" → `QuestionPanelChoice.tsx`
- **KPIs:** Total de respostas; Opção mais escolhida em destaque
- **Gráfico:** `BarChart` horizontal (recharts), uma barra por opção, com qtd e % no rótulo, ordenado desc
- Lê `selected_options` (array) e `options` da pergunta (`evaluation_campaign_questions.options`)
- Sem lista individual

### Tipo "text" → `QuestionPanelText.tsx`
- **KPI:** Total de respostas
- **Lista paginada (20/página):** cards com data, hora e `text_answer` completo, ordenado por data desc
- Sem gráficos

## 4. Dados

Hook novo `useCampaignQuestionAnalytics(campaignId, startDate, endDate)` em `src/hooks/use-campaign-question-analytics.ts`:
- Carrega perguntas da campanha (`evaluation_campaign_questions` ativas, com `order_position`, `question_type`, `options`)
- Carrega `customer_evaluations` filtradas por `campaign_id` + período, com `evaluation_answers` (incluindo `selected_options`, `text_answer`, `comment`)
- Junta `customer_name` por evaluation
- Retorna estrutura agrupada por pergunta: `{ question, answers[] }` pronta para os 3 painéis
- Reaproveita filtros já usados em `useCustomerEvaluations`

## 5. Arquivos

**Novos:**
- `src/pages/pdv/evaluations/reports/ReportPerQuestion.tsx`
- `src/components/evaluations/reports/per-question/QuestionPanelStars.tsx`
- `src/components/evaluations/reports/per-question/QuestionPanelChoice.tsx`
- `src/components/evaluations/reports/per-question/QuestionPanelText.tsx`
- `src/components/evaluations/reports/per-question/QuestionSummaryCard.tsx` (linha-resumo do accordion)
- `src/hooks/use-campaign-question-analytics.ts`

**Editados:**
- `src/pages/pdv/EvaluationsLayout.tsx`: adicionar item de menu + rota lazy

## 6. Notas técnicas

- Cores via tokens semânticos (sem cores hardcoded fora de `chart-*` já usados nos relatórios atuais)
- `date-fns` com `ptBR` para formatação
- Reutilizar `DatePickerWithRange` e padrão visual dos relatórios existentes (`ReportDaily`/`EvaluationsReports`)
- Paginação client-side simples (estado local), já que volumes por pergunta são pequenos
- Acessibilidade do accordion via `@/components/ui/accordion` (Radix)
