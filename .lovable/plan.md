
## Diagnóstico — por que o fechamento não bate

Comparei o fluxo da Saipos com o nosso. A lógica de fórmula é a mesma:

```
Esperado Dinheiro = Abertura + Vendas em dinheiro + Reforços − Sangrias
Esperado por cartão/PIX/VR = Σ vendas da forma no turno
```

No nosso código (`use-pdv-cashier.ts`, `use-pdv-payments.ts`, `use-pdv-delivery-checkout.ts`) a fórmula está correta — o problema é **como os totais são armazenados**, não como são calculados.

### Causa-raiz #1 — Race condition nos totais da sessão

Hoje cada pagamento faz read‑modify‑write **no client**:

```ts
// pseudo
const { data: session } = await supabase.select("*").eq("id", id).single();
const updates = { total_cash: session.total_cash + amount, ... };
await supabase.update(updates).eq("id", id);
```

Acontece em **4 pontos** independentes:
- `registerPayment` (comanda)
- `registerTablePayment` (mesa)
- `registerPartialPayment` (parcial)
- `registerDeliveryPayment` (delivery / delivery online)
- e `addMovement` (sangria → `total_withdrawals`)

Se duas vendas são confirmadas em sequência rápida (PDV + delivery, dois operadores, ou clique duplo), a segunda lê um valor já desatualizado e **sobrescreve** a primeira. Resultado: `pdv_cashier_movements` tem 10 vendas, mas `pdv_cashier_sessions.total_cash` reflete só 8. A coluna "Esperado" do fechamento usa esses totais e o operador vê uma "falta" inexistente.

### Causa-raiz #2 — "Outros meios" nunca é persistido

`CloseCashierDialog` calcula `totalOther` a partir de movements em tempo de tela, mas no `closeCashier` (linha 193) salva `otherDiff = declaredOther − 0`. O esperado vira zero, qualquer valor declarado parece "sobra".

### Causa-raiz #3 — `expectedCash` viaja desatualizado no payload

O dialog calcula `expectedCash` a partir da sessão carregada quando ele abre. Se chega uma venda enquanto o operador conta o dinheiro, fecha com base num valor velho.

### Outros pontos menores
- `total_change` é gravado mas nunca subtraído em lugar algum (correto, pois `total_cash` já é líquido, mas confunde no relatório se alguém comparar).
- Não temos o conceito de "Transferência entre caixas" da Saipos (não bloqueia, só registramos como observação se quiser depois).

---

## Solução proposta

Tornar **`pdv_cashier_movements` a única fonte de verdade** e recomputar os totais da sessão de forma atômica.

### 1. Nova RPC `pdv_recompute_session_totals(session_id)`

Função `SECURITY DEFINER` que agrega `pdv_cashier_movements` da sessão e gera um `UPDATE pdv_cashier_sessions SET total_cash=…, total_credit=…, total_debit=…, total_pix=…, total_voucher=…, total_online_delivery=…, total_other=…, total_sales=…, total_withdrawals=…` num único statement. Adiciona também a coluna `total_other numeric` na tabela (migração).

Regras de agregação a partir de `pdv_cashier_movements`:
- `total_sales` = Σ amount onde `type='venda'`
- `total_cash` = Σ amount onde `type='venda' AND payment_method='dinheiro'`
- `total_credit`, `total_debit`, `total_pix`, `total_voucher` análogo
- `total_online_delivery` = Σ amount onde `type='venda' AND source='delivery_online'`
- `total_other` = Σ amount onde `type='venda' AND payment_method NOT IN (conhecidos)`
- `total_withdrawals` = Σ amount onde `type='sangria'`

### 2. Substituir os 5 pontos de read‑modify‑write

Em `use-pdv-payments.ts` (3 mutations), `use-pdv-delivery-checkout.ts` e `use-pdv-cashier.ts › addMovement`:

- Insere o `pdv_cashier_movements` (já idempotente por linha).
- No final, chama `supabase.rpc("pdv_recompute_session_totals", { p_session_id })`.
- Remove o bloco `applyDeltas / update` antigo.

Benefício: mesmo se 10 pagamentos chegarem ao mesmo tempo, o último recompute fixa o valor correto a partir dos movements gravados.

### 3. Recalcular no momento de fechar

No `closeCashier` (hook): chamar `pdv_recompute_session_totals` antes de ler `total_*` e calcular `expectedCash` no servidor. Ignorar o `expectedCash` enviado pelo client e recomputar:

```
expectedCash = opening_balance + total_cash + Σ reforços − total_withdrawals
```

Salvar esse `expectedCash` recalculado em `expected_balance` e a diferença real.

### 4. Corrigir persistência de "Outros meios"

- Adicionar coluna `total_other` (migração) e usar na agregação.
- No `closeCashier`, `otherDiff = declaredOther − total_other` (não mais `−0`).

### 5. UI do dialog de fechamento

- Ler `total_*` direto da sessão **após** invalidate; mostrar um toast/spinner de "Atualizando totais…" durante o recompute inicial ao abrir o dialog (chama RPC uma vez).
- Manter o resto do dialog igual (já está aderente ao padrão Saipos: coluna Esperado × Valor apurado × Diferença, justificativa quando o total não bate).

---

## Detalhes técnicos

**Arquivos alterados**
- `supabase/migrations/<nova>` — adiciona `total_other`, cria função `pdv_recompute_session_totals(uuid)`.
- `src/hooks/use-pdv-payments.ts` — remove `applyDeltas`, chama RPC nas 3 mutations.
- `src/hooks/use-pdv-delivery-checkout.ts` — idem.
- `src/hooks/use-pdv-cashier.ts` — `addMovement` chama RPC; `closeCashier` chama RPC antes de calcular `expectedCash` e usa `total_other` real; recalcula `cashDifference` no servidor.
- `src/components/pdv/CloseCashierDialog.tsx` — ao abrir, dispara `recompute` e invalida `pdv-cashier-active`/`movements`; usa `session.total_other` em vez do cálculo local (mantém fallback).

**Compatibilidade**
- Sessões já fechadas não são tocadas.
- `total_card` continua = `total_credit + total_debit` (legado).
- `total_change` permanece informativo, sem efeito no esperado.

**Validação manual sugerida pós‑deploy**
1. Abrir caixa com R$ 100.
2. Lançar 3 vendas em dinheiro de R$ 50 quase simultaneamente.
3. Conferir que `total_cash = 150` e `expectedCash = 250` no dialog.
4. Registrar pagamento de delivery em PIX enquanto o dialog está aberto → reabrir dialog → valor PIX atualizado.
5. Fechar declarando exatamente o esperado → diferença = 0, sem justificativa.

