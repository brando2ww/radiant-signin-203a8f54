
## Objetivo

Transformar o fechamento de caixa num fluxo step-by-step "à prova de fraude", em que o operador preenche os valores apurados sem ver o esperado do sistema, gera imediatamente um histórico imutável para o administrador, e só na segunda etapa enxerga as divergências — sendo obrigado a justificá-las.

## Novo fluxo (CloseCashierDialog)

### Etapa 1 — Apuração às cegas
- Cabeçalho com nome do operador, data/hora de abertura e atual.
- Campo único editável por forma de pagamento (Dinheiro na gaveta, Crédito, Débito, PIX, Vale, Online/Delivery, Outros).
- Para cada forma, **não exibir** o valor esperado, o total do sistema, nem a diferença. Apenas o input "Valor apurado".
- Campo "Total geral apurado" calculado como soma dos inputs (apenas para conferência do próprio operador).
- Botão "Avançar para conferência":
  - Bloqueado até que todos os campos visíveis estejam preenchidos (inclusive R$ 0,00 explícito).
  - Ao clicar, **persiste imediatamente** um snapshot da apuração no banco (ver seção técnica) — esse registro é imutável e visível para o admin mesmo que o operador desista do fechamento depois.
  - Mostra confirmação: "Os valores foram registrados e enviados ao administrador. Não é possível alterá-los nesta sessão."

### Etapa 2 — Conferência e justificativas
- Mostra, por forma de pagamento, três colunas: Esperado (sistema) · Apurado (etapa 1, somente leitura) · Diferença (com sinal e cor).
- Linha de totais com diferença consolidada e badge de risco (ok/baixa/média/alta/crítica) — reaproveita `getRiskLevel`/`getRiskConfig`.
- Para **cada forma com diferença ≠ 0** (sobra ou falta), campo de justificativa obrigatório, mínimo 30 caracteres (alinhado ao padrão anti-fraude já existente no projeto).
- Campo "Observação geral do fechamento" (opcional).
- Botão "Confirmar fechamento" desabilitado enquanto faltar justificativa obrigatória.
- Botão "Voltar" volta para a etapa 1 **apenas visualmente em modo leitura** (não permite editar os valores apurados — o snapshot já foi enviado).

### Etapa 3 — Resumo final (read-only)
- Confirmação visual com resumo do que foi fechado, link/atalho para imprimir o relatório (já existe `printCashierReport`).

## Histórico para o administrador

- Nova entrada no menu **Administrador → Financeiro → Extrato de Caixa** (ou nova aba "Auditoria de fechamento") listando, por sessão:
  - Snapshot da Etapa 1 (apuração às cegas, com timestamp).
  - Resultado da Etapa 2 (diferenças calculadas + justificativas por forma).
  - Status final e nível de risco.
- Cada item permite expandir para ver os valores lado a lado (sistema vs apurado vs justificativa).
- Filtros por operador, data e nível de risco.

## Detalhes técnicos

### Banco de dados
Nova tabela `pdv_cashier_close_blind_snapshots` (snapshot imutável da Etapa 1):
- `id`, `cashier_session_id` (FK), `user_id`, `operator_id`
- `declared_cash`, `declared_credit`, `declared_debit`, `declared_pix`, `declared_voucher`, `declared_online_delivery`, `declared_other`
- `declared_total` (soma)
- `submitted_at` (timestamptz, default now())
- RLS: insert pelo operador da sessão; select pelo dono do estabelecimento e operador.
- Sem update/delete (imutabilidade — política RLS bloqueando).
- Constraint: único por `cashier_session_id` (uma apuração às cegas por sessão).

Reaproveitar colunas já existentes em `pdv_cashier_sessions` para o resultado final (declared_*, *_difference, justification_*, closing_justification, fraud_risk_level) — não há mudança de schema lá.

### Frontend
- `src/components/pdv/CloseCashierDialog.tsx`: refatorar em três passos controlados por `step` state (`'blind' | 'review' | 'done'`). Extrair sub-componentes `BlindEntryStep`, `ReviewStep`, `DoneStep` para manter arquivo navegável.
- `src/hooks/use-pdv-cashier.ts`: nova mutation `submitBlindClosing(payload)` que insere o snapshot e retorna os totais esperados do sistema (consultados após a inserção). Manter `closeCashier` para a confirmação final, recebendo `blindSnapshotId`.
- Etapa 2 só carrega os valores esperados **depois** que o snapshot da Etapa 1 está persistido (garante que o operador não consiga vê-los antes).
- Validação: justificativa por forma com diferença ≠ 0 (tolerância R$ 0,005), mínimo 30 caracteres.

### Página de auditoria do admin
- Novo componente `src/components/pdv/financial/CashierBlindAuditList.tsx` consumido em `src/pages/pdv/financial/CashierStatement.tsx` (nova aba "Auditoria de fechamento") ou nova rota `/pdv/financeiro/auditoria-caixa`.
- Hook `use-pdv-cashier-audit.ts` lendo `pdv_cashier_close_blind_snapshots` + `pdv_cashier_sessions` relacionados.

## Fora de escopo
- Não altera o fluxo de abertura de caixa.
- Não altera permissões existentes além das RLS da nova tabela.
- Não altera o modelo de risco (mantém `getRiskLevel`).
