## Reordenação do modal "Fechar Caixa"

Mover o campo **"Valor total de venda do dia"** para logo após a **Seção 1 — Resumo da gaveta**, antes da Seção 2 (Totais por forma de pagamento).

### Arquivo afetado
- `src/components/pdv/CloseCashierDialog.tsx`

### Nova ordem das seções
1. Resumo da gaveta (abertura, suprimentos, sangrias, dinheiro contado)
2. **Valor total de venda do dia** (movido para cá)
3. Totais por forma de pagamento (sistema)
4. Conferência por método (informado vs esperado)
5. Resumo das diferenças
6. Justificativa única (se houver diferença)
7. Resumo final + status

### Detalhes técnicos
- Apenas reordenação de JSX. Nenhuma mudança em estado, validação, payload ou hooks.
- O cálculo de diferença do total de vendas continua o mesmo.