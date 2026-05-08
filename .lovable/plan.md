## Unificar Seções 2 e 3 em "Resumo do caixa e vendas por pagamento"

Combinar a Seção 2 (Resumo da gaveta) e a Seção 3 (Vendas por forma de pagamento) em uma única seção, dentro de um único Card dividido em dois blocos internos.

### Arquivo afetado
- `src/components/pdv/CloseCashierDialog.tsx`

### Nova estrutura do modal
1. Valor total de venda do dia
2. **Resumo do caixa e vendas por pagamento** (nova seção unificada)
3. Conferência dos valores apurados
4. Diferenças encontradas
5. Justificativa da diferença
6. Resumo final do fechamento

### Layout da nova Seção 2
Um único `<Card>` com `CardContent` contendo dois blocos separados por um `<Separator />`:

**Bloco 1 — Gaveta / dinheiro físico**
- Subtítulo discreto: "Gaveta / dinheiro físico"
- Abertura
- Vendas em dinheiro
- Reforços
- Sangrias
- Saldo esperado da gaveta (em destaque)

**Bloco 2 — Vendas registradas por forma de pagamento**
- Subtítulo discreto: "Vendas registradas por forma de pagamento"
- Linhas vindas de `visibleRows` (Dinheiro, Crédito, Débito, PIX, Vale-refeição, Online/Delivery, Outros — apenas as com valor > 0 ou já visíveis)
- Linha final: "Total de vendas registradas" (= `expectedTotal`) em destaque

### Detalhes técnicos
- Header da seção: ícone `Wallet` + título "2. Resumo do caixa e vendas por pagamento"
- Subtítulos dos blocos: `text-xs font-semibold text-muted-foreground uppercase tracking-wide`
- `space-y-1.5` nas linhas internas, `space-y-3` entre blocos
- Renumerar Seções 4→3, 5→4, 6→5, 7→6 (comentários e títulos H3)
- Sem mudança em estado, hooks, payload ou validação — apenas reorganização de JSX
- Usa cores semânticas existentes (sem novos tokens)