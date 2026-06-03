# Dashboard Super Admin enriquecido

Reescreve `/admin` para virar uma central executiva com dados reais agregados de todos os tenants. Conforme decidido, **fica fora do escopo**: MRR, Inadimplentes, Trial, Distribuição por plano, Tenants online agora e "sem acesso há X dias" — não existe schema de billing nem tracking de acesso hoje.

## Filtro de período global
Topo da página: `Hoje`, `Últimos 7 dias`, `Últimos 30 dias`, `Mês atual`, `Personalizado`. Estado mantido em contexto local da página; todos os hooks recebem `{ start, end }`. Comparação automática com o período anterior de mesma duração (helper `previousPeriod` já existe em `src/lib/report-period.ts`).

## Seção 1 — Indicadores principais (6 cards)
Substitui os 4 atuais. Removidos MRR, Trial, Inadimplentes.

- **Total de Tenants** — total + Δ vs período anterior (novos no período)
- **Tenants Ativos** — `is_active=true`, com % do total
- **Total de Usuários** — soma de `establishment_users`
- **Módulos Ativos** — registros em `tenant_modules` com `is_active=true`
- **Novos tenants no período** — count filtrado por `created_at`, com meta configurável (localStorage `admin:goal:new-tenants`, editável inline)
- **Franquias** — tenants com `parent_tenant_id` not null (extra útil, já existe na base)

Cards clicáveis → `/admin/tenants` com filtro pré-aplicado via querystring.

## Seção 2 — Atividade da plataforma no período
Agrega de todos os tenants no intervalo selecionado:

- Vendas processadas (R$) — soma `pdv_payments.amount`
- Pedidos de delivery — count `delivery_orders`
- Avaliações recebidas — count `customer_evaluations`
- Checklists executados — count `checklist_executions` (ou tabela equivalente)
- Cupons emitidos — count `campaign_prize_wins`

Grid de 5 cards compactos com ícone + valor + label.

## Seção 3 — Crescimento de tenants (gráfico)
LineChart (Recharts, já usado no projeto) últimos 12 meses, três séries:
- Novos cadastrados/mês (`tenants.created_at`)
- Cancelados/mês (`tenants.is_active=false` agrupado por `updated_at` quando virou false — aproximação; documentar limitação)
- Ativos acumulados (running total)

## Seção 4 — Top 10 tenants por volume
Tabela ordenada por vendas no período:
- Nome (`tenants.name`)
- Volume R$ (soma `pdv_payments` join via `owner_user_id`)
- Pedidos delivery (count)
- Avaliações (count)
- Status (badge `Ativo`/`Inativo`)
- Ação: link → `/admin/tenants/:id`

## Seção 5 — Alertas e atenção (versão viável)
Removidos os itens dependentes de billing/last-access. Mantidos:
- Tenants **inativos** (`is_active=false`) — lista com nome, data de desativação, ação "Ver tenant"
- Tenants **sem nenhum módulo ativo** — risco de não-uso
- Tenants **sem usuários** além do owner — onboarding incompleto
- **Módulos habilitados há +30 dias sem nenhuma venda/pedido/avaliação registrada** — possível desativação (calculado cruzando `tenant_modules.created_at` com atividade do owner)

Cada item com botão "Ver tenant".

## Seção 6 — Saúde dos módulos
Card por módulo (PDV, Delivery, Financeiro, Avaliações, Tarefas, Fiscal):
- % de tenants com o módulo ativo (count `tenant_modules` / total tenants)
- Volume agregado no período (vendas/pedidos/avaliações/checklists/NFCe conforme módulo)
- Mini barra de progresso da adoção

## Seção 7 — Feed de atividade recente
Timeline das últimas 20 entradas, unindo:
- Novos tenants (`tenants.created_at`)
- Toggles de módulo (`tenant_modules` com `created_at`/`updated_at`)
- Novas integrações (`tenant_integrations.created_at`)
- Entradas relevantes de `activity_logs` (se existir conteúdo útil para super admin)

Cada linha: hora relativa (ptBR via `date-fns`), nome do tenant, descrição da ação, ícone.

## Arquivos

**Novos**
- `src/hooks/use-admin-dashboard.ts` — hook orquestrador com sub-queries (React Query) para cada seção, aceita `{ start, end }`
- `src/components/super-admin/dashboard/AdminPeriodFilter.tsx`
- `src/components/super-admin/dashboard/AdminMetricsGrid.tsx` (Seção 1)
- `src/components/super-admin/dashboard/AdminActivitySection.tsx` (Seção 2)
- `src/components/super-admin/dashboard/AdminGrowthChart.tsx` (Seção 3)
- `src/components/super-admin/dashboard/AdminTopTenants.tsx` (Seção 4)
- `src/components/super-admin/dashboard/AdminAlertsPanel.tsx` (Seção 5)
- `src/components/super-admin/dashboard/AdminModulesHealth.tsx` (Seção 6)
- `src/components/super-admin/dashboard/AdminActivityFeed.tsx` (Seção 7)
- `src/components/super-admin/dashboard/SectionSkeleton.tsx`

**Editado**
- `src/pages/super-admin/AdminDashboard.tsx` — reescrito, monta as 7 seções, gerencia estado de período

## Diretrizes técnicas
- Todas as consultas via `supabase` client com `.in('owner_user_id', [...])` ou joins por `tenant_id`. Limites: respeitar 1000 linhas; quando necessário usar `count: 'exact', head: true` ou aggregations via `rpc` (criar somente se realmente necessário; preferir cliente).
- Skeleton por seção (Suspense-like via flag `isLoading` de cada hook).
- Cores: usar tokens semânticos (`bg-card`, `text-foreground`, `text-muted-foreground`, `border-destructive` para crítico, `border-yellow-500/40` para atenção — conforme regra do projeto, sem gradientes/accents personalizados).
- Currency sempre via `formatBRL`/`formatBRLCompact`.
- Datas com `ptBR` locale.
- Layout responsivo: grid 4 col desktop / 2 col tablet / 1 col mobile.
- Sem novas migrations.

## Fora de escopo (confirmado)
- MRR, Distribuição por plano, Inadimplentes, Trial expirando, Tenants online agora, "sem acesso há 15 dias", "erros recorrentes do sistema". Esses ficam para uma fase futura quando o schema de billing e o tracking de acesso forem criados.
