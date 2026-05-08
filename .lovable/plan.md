## Objetivo

Reformar o fluxo de **Fechar Caixa** para forçar uma conferência real de todos os meios de pagamento, com cálculo automático de diferença, status visual (Sem diferença / Sobra / Falta), justificativa obrigatória e confirmação extra antes do fechamento. Manter toda funcionalidade atual.

---

## Mudanças

### 1. `src/components/pdv/CloseCashierDialog.tsx` (refatoração principal)

Reorganizar o modal nas seções pedidas e adicionar campos novos.

**Seção 1 — Resumo da gaveta / dinheiro físico** (já existe, manter)
- Abertura, vendas em dinheiro, reforços, sangrias, saldo esperado.
- Campo "Dinheiro contado na gaveta" (já existe).
- Diferença da gaveta com indicador visual.

**Seção 2 — Vendas por forma de pagamento (esperado pelo sistema)**
- Card só-leitura listando totais do sistema por meio: Dinheiro, Crédito, Débito, PIX, Vale-refeição, **Online/Delivery** (quando `total_online_delivery > 0`) e **Outros** (quando houver totais não cobertos — ver seção 7).
- Total geral esperado.

**Seção 3 — Conferência dos valores apurados** (expandir o atual `MethodConference`)
- Adicionar entradas para **Dinheiro** (já coberto pela contagem da gaveta — reaproveita), **Online/Delivery** e **Outros meios** detectados (lista dinâmica).
- Cada linha: nome, esperado (sistema), input "Valor apurado" (CurrencyInput BRL), diferença em tempo real com badge:
  - `= 0` → "Sem diferença" (verde, ícone CheckCircle2)
  - `> 0` → "Sobra" (laranja/amber, ícone AlertTriangle)
  - `< 0` → "Falta" (vermelho/destructive, ícone AlertCircle)

**Novo campo — "Valor total de venda do dia"** (obrigatório)
- Posicionado acima da Seção 6 (Resumo final).
- CurrencyInput BRL.
- Mostra ao lado: total esperado pelo sistema, total informado, diferença total com mesmo padrão Sem diferença/Sobra/Falta.

**Seção 4 — Diferenças encontradas**
- Lista resumida apenas dos meios com diferença ≠ 0 (mais o total geral, se houver).

**Seção 5 — Justificativa da diferença**
- Campo único `Textarea` "Justificativa da diferença" (mínimo **10 caracteres**, conforme pedido — substitui o atual `MIN_JUSTIFICATION_LENGTH = 30` neste fluxo).
- Aparece automaticamente sempre que houver qualquer diferença ≠ 0 (gaveta, qualquer meio, ou total).
- Mensagem inline: "Existe diferença no fechamento. Informe uma justificativa para continuar."
- Manter compatibilidade com os campos `justification_*` por meio salvando a mesma justificativa única em todos os meios divergentes (preserva auditoria existente).

**Seção 6 — Resumo final do fechamento**
- Total esperado pelo sistema, total informado pelo operador, diferença total.
- Status do fechamento: "Sem diferença" / "Fechado com sobra" / "Fechado com falta".
- Justificativa, se houver.
- Lista por meio (status conferido / sobra / falta).

**Validação do botão "Confirmar Fechamento"**
- Desabilitado se: dinheiro contado vazio, ou existir diferença em qualquer meio sem justificativa (≥10 chars), ou risco crítico bloqueado.

**Confirmação extra antes de fechar**
- Se houver qualquer diferença, abrir um `AlertDialog` ao clicar em Confirmar:
  > "Este caixa possui diferença de R$ X. Deseja confirmar o fechamento com justificativa?"
  - Botões: "Voltar e revisar" / "Confirmar fechamento".
- Se diferença = 0, fecha direto.

### 2. Hook `src/hooks/use-pdv-cashier.ts`

Estender `CloseCashierPayload` com:
- `declaredOnlineDelivery?: number | null`
- `declaredOther?: number | null`
- `declaredTotalSales?: number | null`
- `totalDifference?: number | null`
- `closingStatus?: "no_difference" | "surplus" | "shortage"`

No `mutationFn`, persistir os novos campos (ver migração) e propagar a justificativa única para todos os campos `justification_*` dos meios com divergência (mantém auditoria por forma).

### 3. Migração de banco — `pdv_cashier_sessions`

Adicionar colunas (todas nullable, sem quebrar dados existentes):
- `declared_online_delivery numeric`
- `declared_other numeric`
- `online_delivery_difference numeric`
- `other_difference numeric`
- `justification_online_delivery text`
- `justification_other text`
- `declared_total_sales numeric`
- `total_difference numeric`
- `closing_status text` — valores: `no_difference`, `surplus`, `shortage`
- `closing_justification text` — justificativa única do fechamento

Sem alteração de RLS (políticas existentes cobrem).

### 4. Histórico financeiro — `src/pages/pdv/financial/CashierStatement.tsx` + `src/hooks/use-pdv-cashier-statement.ts`

Expandir cada linha/expansão de sessão fechada para mostrar:
- Quem fechou (já há `user_id` → buscar nome via `establishment_users`/`profiles` se já disponível, senão exibir id curto).
- Quando fechou (`closed_at`) — já existe.
- Por meio: esperado vs informado vs diferença (Crédito, Débito, PIX, VR, Online, Outros, Dinheiro/gaveta).
- Total esperado / informado / diferença total.
- Justificativa (`closing_justification` com fallback para `notes` em sessões antigas).
- Badge de status (`closing_status`) com fallback computado pelo sinal de `balance_difference`.

Atualizar a query do hook para `select("*")` ou listar explicitamente os novos campos.

---

## Detalhes técnicos

- **Cores**: usar tokens semânticos do design system (`text-destructive`, `text-foreground`, `bg-muted`, `text-primary`); ainda permitido usar verde/laranja sutis para Sobra/Falta como já feito hoje no `MethodConference` (consistência visual).
- **Currency**: continuar com `CurrencyInput` + `formatBRL`/`formatBRLCompact`.
- **i18n**: pt-BR.
- **Compat**: campos antigos (`balance_difference`, `difference_justified`, `fraud_risk_level`, `justification_*` por meio) continuam preenchidos para não quebrar relatórios atuais.
- **"Outros meios"**: detectar somando movimentos de `pdv_cashier_movements` cujo `payment_method` não esteja em {dinheiro, credito, debito, pix, vale_refeicao} e que tenham `type='venda'`. Se 0, ocultar a linha.
- Reset de estado ao fechar o modal (já existe — incluir os novos campos).

---

## Fora do escopo

- Não mudar relatórios de DRE/Fluxo de Caixa.
- Não alterar lógica de abertura de caixa.
- Não tocar nas movimentações (sangria/reforço).
