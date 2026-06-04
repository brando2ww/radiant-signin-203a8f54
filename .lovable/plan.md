# Substituir "Em breve" por funcionalidades reais

Plano para implementar as 6 áreas marcadas como stub. Sempre que possível reuso de tabelas já existentes; só uma nova tabela é necessária (badges/conquistas).

## 1. Cupons de avaliação — `EvalCupons.tsx`

Fonte: `campaign_prize_wins` (já tem `coupon_code`, `customer_name/whatsapp`, `coupon_expires_at`, `is_redeemed`, `redeemed_at`, `campaign_id`, `prize_id`) + joins em `evaluation_campaigns.name` e `campaign_prizes(name, reward_type, reward_value)`.

- Hook `use-evaluation-coupons.ts` (React Query) com filtros: período (`created_at`) e `campaign_id`.
- Página com:
  - Filtros: DateRangePicker (ptBR) + Select de campanha + busca por código/cliente.
  - Tabela: Código, Cliente, WhatsApp, Campanha, Prêmio, Valor (formatBRL quando `reward_type='discount'`), Gerado em, Validade, Status (Badge "Usado" / "Disponível" / "Expirado" calculado a partir de `is_redeemed` e `coupon_expires_at`).
  - `EmptyState`/`ErrorState` (já criados).
- Sem mudanças de schema.

## 2. Clientes avaliadores — `EvalClientes.tsx`

Fonte: `customer_evaluations` (tem `customer_name`, `customer_whatsapp`, `customer_birth_date`, `nps_score`, `evaluation_date`, `campaign_id`).

- Hook `use-evaluation-customers.ts`. Deduplicar por telefone mantendo a avaliação mais recente; expor `totalEvaluations` por cliente.
- Página:
  - Cards de resumo: Total de avaliadores, NPS médio, Aniversariantes do mês.
  - Seção destaque "Aniversariantes do mês" (filtra `EXTRACT(MONTH FROM customer_birth_date) = currentMonth`).
  - Tabela: Nome, Telefone, NPS (badge colorido por faixa: 0–6 detrator, 7–8 neutro, 9–10 promotor), Última avaliação (date-fns ptBR), Campanha, # avaliações.
  - Filtros: período + campanha + checkbox "Somente aniversariantes do mês".
  - Botão "Exportar CSV" usando utilitário simples (`Blob`/`URL.createObjectURL`), nomes em pt-BR.

## 3. Contatos adicionais do fornecedor — `SupplierDialog.tsx`

`pdv_suppliers.contacts` já existe (jsonb). Sem migração.

- Tipo `SupplierContact = { id: string; name: string; role?: string; phone?: string; email?: string }`.
- Componente novo `SupplierContactsTab.tsx` dentro do drawer:
  - Lista de cards com nome/cargo e ações Edit/Remove (menu ⋮ conforme padrão).
  - Botão "Adicionar contato" abre formulário inline (não Dialog aninhado) com campos validados.
  - `id` gerado via `crypto.randomUUID()`.
  - Estado controlado por `useFieldArray`/`watch("contacts")` integrado ao submit existente — salva no mesmo update do supplier.
- Substituir bloco em `SupplierDialog.tsx` linhas 606–612.

## 4. Meta do Mês configurável — `Dashboard.tsx`

Fonte: `monthly_goals` (já existe com `month_year`, `revenue_goal`). Sem migração.

- Hook `use-monthly-goal.ts`:
  - `useQuery` por `month_year = YYYY-MM-01` do mês atual.
  - `useMutation` `upsert` em `(user_id, month_year)`.
- Componente `MonthlyGoalCard.tsx` substituindo o card hardcoded:
  - Sem meta: botão "Definir meta" abre Dialog com `Input` (máscara BRL).
  - Com meta: valor da meta, progresso (`Progress` shadcn) baseado em `metrics.monthSales / revenue_goal`, percentual e diferença restante; ícone ⋮ para editar.
- Verificar política RLS de `monthly_goals` (assumida por `user_id = auth.uid()`); confirmar via `supabase.linter` se necessário.

## 5. Melhor/Menor score da semana — `TeamIndicators.tsx`

Fontes: `checklist_executions(operator_id, score, completed_at, status)` + `checklist_operators(name, avatar_color)`. Já existe `operator_scores` que pode acelerar; usaremos agregação direta para garantir frescor.

- Hook `use-team-week-indicators.ts`:
  - Janela: `startOfWeek(now, { locale: ptBR })` → `endOfWeek`.
  - Query agrupando `checklist_executions` por `operator_id` (status `completed`), calculando `AVG(score)`.
  - Retorna `{ best, worst }` com `{ operatorId, name, avgScore, executions }`.
- Substituir os dois cards "Em breve" pelos valores reais + sublabel "Semana atual"; manter "—" quando sem execuções na semana.

## 6. Badges/Conquistas do operador — `OperatorProfileDrawer.tsx`

Não há tabela existente. Criar uma e popular via regras simples (futuro: triggers; agora: leitura).

### Migração

Tabela `public.operator_achievements`:
- `id uuid pk default gen_random_uuid()`
- `user_id uuid not null` (dono — establishment owner)
- `operator_id uuid not null references checklist_operators(id) on delete cascade`
- `code text not null` (ex.: `streak_7d`, `perfect_week`, `top_score`)
- `name text not null`
- `icon text not null` (lucide name)
- `awarded_at timestamptz not null default now()`
- `unique (operator_id, code)`
- timestamps + trigger `handle_updated_at` não necessário.
- GRANTs: `SELECT, INSERT, UPDATE, DELETE` para `authenticated`; `ALL` para `service_role`.
- RLS: `auth.uid() = user_id OR public.is_establishment_member(user_id)`.

### UI

- Hook `use-operator-achievements.ts` (por `operator_id`).
- Seção Badges renderiza grid de cards com `<Icon />` (lookup `lucide-react`), nome, data (`format(awarded_at, "dd/MM/yyyy", { locale: ptBR })`).
- Empty state: "Nenhuma conquista ainda".
- População inicial automática: não criar trigger ainda — apenas leitura. Documentar em comentário JSX que o lançamento de badges será feito posteriormente.

## Arquivos

**Novos**
- `src/hooks/use-evaluation-coupons.ts`
- `src/hooks/use-evaluation-customers.ts`
- `src/hooks/use-monthly-goal.ts`
- `src/hooks/use-team-week-indicators.ts`
- `src/hooks/use-operator-achievements.ts`
- `src/components/pdv/suppliers/SupplierContactsTab.tsx`
- `src/components/pdv/dashboard/MonthlyGoalCard.tsx`
- Migração `operator_achievements`

**Editados**
- `src/pages/pdv/evaluations/EvalCupons.tsx` (reescrita completa)
- `src/pages/pdv/evaluations/EvalClientes.tsx` (reescrita completa)
- `src/components/pdv/SupplierDialog.tsx` (linhas 606–612)
- `src/pages/pdv/Dashboard.tsx` (linhas 86–92)
- `src/components/pdv/checklists/team/TeamIndicators.tsx`
- `src/components/pdv/checklists/team/OperatorProfileDrawer.tsx`

## Padrões respeitados

- Cores: somente tokens semânticos (`bg-card`, `text-muted-foreground`, `border-primary` etc.).
- Datas: `date-fns` com `ptBR` explícito.
- Moeda: `formatBRL`.
- React Query para todas as buscas com `EmptyState` / `ErrorState` / skeletons.
- Sem alterações de lógica de negócio existente; apenas UI + leitura/escrita das tabelas listadas.

## Pergunta antes de prosseguir

Confirmar: posso criar a tabela `operator_achievements` na migração do item 6 (apenas leitura por enquanto, sem geração automática de badges)? Se preferir adiar, o item 6 mostrará só o empty state "Nenhuma conquista ainda".
