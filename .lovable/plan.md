# Correções de isolamento multi-tenant

## 1. `is_establishment_member` — assinatura ambígua

A função atual recebe `owner_id` e apenas confirma membership do `auth.uid()` nesse owner. Não há "colisão de IDs": como `owner_id` é UUID global, o problema real é que algumas policies passam o `user_id` do recurso sem garantir que esse `user_id` seja efetivamente o **owner** do establishment do usuário logado (e não outro UUID qualquer existente como user).

**Ação (migration):**
- Manter a função `is_establishment_member(owner_id uuid)` como está (não quebrar policies existentes).
- Criar função auxiliar `public.current_establishment_owner()` que retorna o owner do `auth.uid()` (ou o próprio `auth.uid()` se for dono). Já existe `pdv_resolve_owner` — reaproveitar.
- Adicionar variante explícita `public.can_access_owner(_owner uuid)` que retorna `(_owner = auth.uid()) OR is_establishment_member(_owner)` para padronizar uso futuro. Não reescreve policies em massa.
- **Checklists**: nas tabelas `checklist_*` (criadas na migration 20260414021544 e posteriores), garantir que toda policy use o `user_id`/`owner_user_id` do recurso (não o `auth.uid()` direto). Auditar e corrigir policies que estejam usando apenas `is_establishment_member(auth.uid())` em vez de `is_establishment_member(<coluna do recurso>)`.

## 2. `tenant_integrations` — SELECT para o próprio tenant

Adicionar policy via migration:

```sql
CREATE POLICY "Tenant can view own integrations"
ON public.tenant_integrations FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_establishment_member(user_id));
```

Verificar que `GRANT SELECT ... TO authenticated` já existe; se não, adicionar.

## 3. Filtro explícito em exports

Em `src/lib/export-utils.ts` e `src/lib/reports-export.ts` (e quaisquer chamadas em hooks de exportação), adicionar parâmetro `ownerId` obrigatório e aplicar `.eq('user_id', ownerId)` (ou coluna equivalente) em todas as queries — mesmo que a RLS já filtre. Resolver `ownerId` via hook `use-establishment-id` no call-site.

Defense-in-depth: se a RLS algum dia regredir para `USING(true)`, o export continua isolado.

## 4. Settings.tsx — fiação completa das abas

Hoje `VisualTab`, `FiscalTab`, `IntegrationsTab` e `PermissionsTab` são renderizados sem `onSave`. Necessário:

- **VisualTab / FiscalTab / IntegrationsTab / PermissionsTab**: cada uma deve receber `onSave` (ou ter seu próprio submit interno que persista no Supabase e emita toast de sucesso/erro). Para tabs com persistência própria (ex.: `PermissionsTab` que grava em `pdv_action_permissions`), manter submit interno mas garantir feedback.
- **IntegrationsTab** especificamente: o campo CNPJ NF-e deve ser salvo via mutation própria em `tenant_integrations` (ou `business_settings`, conforme onde está sendo lido) com toast de sucesso/erro e estado de loading no botão "Salvar".
- Padronizar: todo botão "Salvar" deve mostrar `Loader2` durante o submit e exibir toast ao final.

## Resumo técnico (ordem de execução)

```text
1. Migration: policy SELECT em tenant_integrations + helper can_access_owner
2. Migration: auditoria e correção de policies em checklist_* que usem auth.uid() direto
3. Refactor src/lib/export-utils.ts e reports-export.ts → exigir ownerId
4. Atualizar call-sites de exportação para passar ownerId via use-establishment-id
5. Fiar onSave em VisualTab/FiscalTab/IntegrationsTab/PermissionsTab
6. Implementar mutation + toast no campo CNPJ NF-e de IntegrationsTab
```

## Arquivos afetados

- `supabase/migrations/<new>_multi_tenant_hardening.sql`
- `src/lib/export-utils.ts`, `src/lib/reports-export.ts`
- Hooks de exportação que chamam essas funções
- `src/pages/pdv/Settings.tsx`
- `src/components/pdv/settings/{Visual,Fiscal,Integrations,Permissions}Tab.tsx`

## Pontos a confirmar antes de implementar

1. Posso auditar/listar quais policies de `checklist_*` precisam de correção e ajustá-las no mesmo migration (potencialmente várias)? Ou prefere que eu apenas adicione o helper e deixe a correção das policies para um próximo passo após revisão?
2. Para o CNPJ NF-e em `IntegrationsTab`, ele deve ser salvo em `tenant_integrations` (chave `nfe_cnpj`) ou em `business_settings.document`? Ver qual já é a fonte usada pelo restante do sistema NF-e.
