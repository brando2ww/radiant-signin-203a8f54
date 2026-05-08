## Reordenar: "Valor total de venda do dia" como Seção 1

Mover a Seção 2 (Valor total de venda do dia) para o topo do modal, virando a nova Seção 1, e renumerar as demais.

### Arquivo afetado
- `src/components/pdv/CloseCashierDialog.tsx`

### Nova ordem
1. Valor total de venda do dia
2. Resumo da gaveta / dinheiro físico
3. Vendas por forma de pagamento (sistema)
4. Conferência dos valores apurados (com Dinheiro da gaveta)
5. Diferenças encontradas
6. Justificativa da diferença
7. Resumo final do fechamento

### Detalhes técnicos
Apenas reordenação e renumeração de JSX. Nenhuma mudança em estado, validação, hooks ou payload.