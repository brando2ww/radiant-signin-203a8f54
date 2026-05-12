## Diagnóstico

O upload de fotos no módulo de Checklists falha com erro de RLS no Storage.

**Causa raiz:** O bucket `checklist-evidence` tem políticas de Storage restritas ao role `authenticated`:

- INSERT/UPDATE/DELETE → apenas `authenticated`
- SELECT → `public` (ok)

Porém os checklists são executados pela página **`/PublicChecklistAccess`** (acesso por QR Code + PIN do operador), que **não autentica** no Supabase — a sessão é anônima (`anon`). Resultado: `new row violates row-level security policy` ao chamar `supabase.storage.from("checklist-evidence").upload(...)` em `src/components/pdv/checklists/execution/ExecutionItemRenderer.tsx:73`.

Não existe Edge Function ligada a esse fluxo (a menção a "edge functions" no relato parece referir-se ao endpoint `/storage/v1` do Supabase, que retorna 403 nesse caso).

## Correção proposta (migration de Storage)

Ajustar as políticas do bucket `checklist-evidence` para permitir uploads/atualizações/deletes também ao role `anon`, mantendo o caminho `{ownerUserId}/{executionId}/{itemId}.{ext}` (pasta = user_id do dono do checklist).

```sql
-- INSERT: anon + authenticated
DROP POLICY IF EXISTS checklist_evidence_insert ON storage.objects;
CREATE POLICY checklist_evidence_insert
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'checklist-evidence');

-- UPDATE (necessário para upsert: true)
DROP POLICY IF EXISTS checklist_evidence_update ON storage.objects;
CREATE POLICY checklist_evidence_update
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'checklist-evidence')
  WITH CHECK (bucket_id = 'checklist-evidence');

-- DELETE (limpeza pelo painel autenticado)
DROP POLICY IF EXISTS checklist_evidence_delete ON storage.objects;
CREATE POLICY checklist_evidence_delete
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'checklist-evidence');
```

SELECT permanece público (URLs já são `getPublicUrl`).

## Considerações de segurança

- O bucket é dedicado a evidências de checklist; não contém PII sensível.
- O acesso anônimo é intencional: o operador não tem conta Supabase, autentica-se via PIN no app.
- Mantemos DELETE restrito a `authenticated` para evitar remoção indevida de evidências.
- Caminho continua sob `{owner_user_id}/...`, o que limita colisões e facilita auditoria.

## Validação

1. Aplicar migration.
2. Abrir `/checklist/<token>` (público), digitar PIN, executar item com foto.
3. Confirmar 200 no `POST /storage/v1/object/checklist-evidence/...` e foto visível na galeria de evidências (`/pdv/checklists` → Evidências).

Sem alterações de código no frontend.