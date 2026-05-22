## Melhorias no gráfico "Formas de Pagamento"

Problemas atuais (visíveis no print):
- Rótulos sobrepostos (fiado/vale_refeicao/debito colidem)
- Chaves cruas exibidas ("credito", "debito", "vale_refeicao", "fiado") sem capitalização nem label PT
- Cores quase iguais (tudo escuro) — slices indistinguíveis
- Sem valor em R$ ao lado, só %
- Sem destaque para fatias pequenas (<3%)

### Mudanças em `src/components/pdv/PaymentMethodChart.tsx`

1. **Normalizar labels** usando `paymentMethodLabel` de `src/lib/financial/payment-method-keys.ts` (já cobre dinheiro, pix, credito→Crédito, debito→Débito, vale_refeicao→Vale-refeição, ifood etc.). Adicionar "fiado" → "Fiado" no mapa.
2. **Paleta com contraste real** usando tokens do design system (`--chart-1` a `--chart-5` + `--primary`), uma cor por método — não repetir o azul-escuro em tudo.
3. **Layout donut + legenda lateral rica** no lugar do pie com labels flutuantes:
   - `innerRadius` para virar donut; centro mostra total (R$) e nº de transações
   - Remover `label` inline do `<Pie>` (causa da sobreposição)
   - Legenda customizada à direita (ou abaixo no mobile) listando: cor • método • R$ valor • % • (nº de vendas)
   - Ordenar do maior para o menor
4. **Agrupar fatias <2%** em "Outros" para não poluir, mantendo detalhamento na legenda.
5. **Tooltip** mostrando valor BRL + % + contagem.
6. **Responsivo**: legenda embaixo em telas estreitas, lateral em ≥md.
7. Manter estados loading/empty existentes.

Escopo: somente o componente do gráfico. Sem mudanças na fonte de dados nem no hook.
