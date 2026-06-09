## Diagnóstico

Investigando logs, RLS, grants e o código dos checklists, encontrei **dois bugs reais** que afetam o login pela tela do QR Code (`/checklist/:checklistId`) e pela tela de Tarefas por PIN (`/tarefas/:userId`):

### Bug 1 — Logs de acesso falham silenciosamente (FK violada)
A tabela `checklist_access_logs` tem uma FK obrigatória `operator_id → checklist_operators(id)`. Em `src/pages/PublicChecklistAccess.tsx`, três inserts usam o placeholder `"00000000-0000-0000-0000-000000000000"`:

- linha 82–87 — `action: "qr_open"`
- linha 116–121 — `action: "qr_pin_fail"`
- linha 127–132 — `action: "qr_blocked"`

Esse UUID não existe em `checklist_operators`, então o insert é rejeitado por violação de FK. O erro é engolido (`.then(() => {})`) e a auditoria nunca registra tentativas falhas, aberturas de QR nem bloqueios — por isso "olhando os logs" parece que algumas pessoas simplesmente não usam, quando na verdade tentaram e falharam sem deixar rastro. Confirmado: nos últimos 7 dias temos 123 `login` mas zero `qr_pin_fail` / `qr_blocked` / `qr_open`.

### Bug 2 — Login por PIN exige QR habilitado em algum checklist do tenant
A política RLS `Public can validate operators for qr access` em `checklist_operators` (role `anon`) só libera o `SELECT` se o tenant tiver **pelo menos um** checklist com `is_active = true` AND `qr_access_enabled = true`.

Isso cria um acoplamento perigoso: a tela `/tarefas/:userId` (`PinLoginScreen`) é genérica, não tem nada a ver com QR Code, mas usa a mesma política. Se um cliente desativar QR em todos os checklists, **ninguém consegue mais validar PIN** — nem no QR, nem na rota de tarefas — e a única mensagem é "PIN inválido", sem pista do motivo real.

Hoje todos os tenants ativos têm ≥1 checklist com QR ligado, então o sintoma ainda não aparece em escala, mas é a causa mais provável do "PIN inválido" relatado por alguns operadores: basta o gestor desativar/ocultar o checklist de QR de um setor.

## Mudanças propostas

### 1. `supabase/migrations/<timestamp>_fix_checklist_access_logs_fk.sql`
- Permitir `operator_id NULL` em `checklist_access_logs` (para eventos sem operador conhecido: `qr_open`, `qr_pin_fail`, `qr_blocked`).
- Trocar a FK para `ON DELETE SET NULL`.
- Atualizar a policy `Public can insert qr access logs` mantendo o `WITH CHECK` por `user_id` do checklist QR-enabled.

### 2. `supabase/migrations/<timestamp>_loosen_operator_pin_validation.sql`
- Criar política adicional em `checklist_operators` para `anon`:
  `SELECT` permitido se `is_active = true` AND existe **qualquer** checklist do mesmo `user_id` ativo (sem exigir `qr_access_enabled`).
- Mantém a política atual; só relaxa para que a rota `/tarefas/:userId` funcione mesmo sem QR habilitado em todo lugar.
- Continua segura: ainda só expõe operadores quando existe ao menos um checklist ativo no tenant; o `pin` é validado em filtro do cliente (igualdade).

### 3. `src/pages/PublicChecklistAccess.tsx`
- Substituir o placeholder `"00000000-..."` por `null` nos três inserts de log.
- Trocar `.then(() => {})` por `.then(({ error }) => { if (error) console.warn(...) })` em todos os inserts de log para detectar falhas futuras durante o debug.

### 4. `src/components/pdv/checklists/execution/PinLoginScreen.tsx`
- Adicionar mensagem de erro diferenciada quando o `select` retornar erro RLS (ex.: "Sem checklists disponíveis — peça ao gestor para habilitar"), em vez de sempre dizer "PIN inválido".
- Log no console do erro retornado pelo Supabase para facilitar próximas investigações.

## Validação

- Rodar a migração e testar `insert` em `checklist_access_logs` com `operator_id = null` pela role `anon` simulando o fluxo do QR.
- Validar manualmente no preview: abrir QR de um checklist, errar PIN 3x, conferir as 4 linhas de log (`qr_open`, 3× `qr_pin_fail`, `qr_blocked`) na tabela.
- Desativar `qr_access_enabled` em todos os checklists de um tenant de teste e confirmar que o PIN via `/tarefas/:userId` continua funcionando.

## Pendência aberta

Não consegui isolar um usuário/estabelecimento específico nos logs ("alguns usuários" sem nome). Se depois das correções acima alguém continuar travando, peço o **email do operador ou nome do estabelecimento** para filtrar os logs novos (que agora vão registrar `qr_pin_fail`) e ir direto na causa.
