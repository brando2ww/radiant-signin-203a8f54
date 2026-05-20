## Objetivo
Quando já houver uma apuração às cegas registrada para a sessão atual, pular a Etapa 1 do dialog `Fechar Caixa` e abrir direto na Etapa 2 (conferência/justificativas), usando os valores declarados salvos no snapshot.

## Mudanças

### `src/components/pdv/CloseCashierDialog.tsx`
1. Ao abrir o dialog (`open && session?.id`), buscar o snapshot existente em `pdv_cashier_close_blind_snapshots` filtrando por `cashier_session_id`.
2. Se encontrado:
   - Preencher os estados `declaredCash/Credit/Debit/Pix/Voucher/Online/Other` com os valores do snapshot.
   - Definir `step = "review"` direto (pular Etapa 1).
3. Se não houver snapshot, manter o fluxo atual (`step = "blind"`).
4. Indicar carregamento enquanto a checagem do snapshot acontece (estado `checkingSnapshot`) para evitar flicker mostrando Etapa 1 antes do redirect.
5. Manter o reset no fechamento do dialog como está.

### Resultado
- Operador que já fez a apuração às cegas não precisa redigitar — vai direto para a conferência com diferenças.
- Elimina o toast "Já existe uma apuração registrada para esta sessão" que aparecia ao tentar reenviar.

## Detalhes técnicos
- Usar `supabase.from("pdv_cashier_close_blind_snapshots").select(...).eq("cashier_session_id", session.id).maybeSingle()` dentro do `useEffect` que já roda no `open`.
- Combinar com o recompute existente em uma única função async.
- Não alterar o hook `usePDVCashier` nem o schema.
