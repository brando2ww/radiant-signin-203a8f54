## Plano

1. **Aplicar o padrão anti-travamento nos dialogs do caixa**
   - Abrir `PaymentDialog` e `ChargeSelectionDialog` de forma deferida (`setTimeout(0)`) quando vierem de atalho F5 ou seleção em lista.
   - Fechar primeiro o modal de seleção e só depois abrir o modal de pagamento, evitando dois Radix Dialogs ativos no mesmo ciclo.

2. **Tornar o `PaymentDialog` seguro contra bloqueios invisíveis**
   - Usar `Dialog modal={false}` com `DialogContent hideOverlay` no pagamento, seguindo a memória do projeto para dialogs complexos.
   - Resetar estados aninhados ao fechar: confirmação de remover item, adicionar item, busca/produto selecionado, seleção parcial e estados de sucesso quando necessário.
   - Fechar automaticamente se abrir sem contexto válido de cobrança ou sem itens pendentes, mostrando aviso em vez de deixar a tela presa.

3. **Corrigir dialogs aninhados dentro do pagamento**
   - Converter o modal “Adicionar item” e o alerta “Remover item” para o mesmo padrão seguro: sem overlay bloqueante quando estiverem sobre o pagamento e com limpeza de estado no fechamento.
   - Garantir que Selects/portais usados dentro do pagamento não deixem camada residual bloqueando clique.

4. **Proteger o F5 contra reentrada**
   - Ignorar F5 enquanto qualquer abertura/fechamento de modal estiver em andamento.
   - Centralizar a abertura do pagamento em uma função única que limpa seleção anterior antes de abrir a nova cobrança.

## Arquivos previstos

- `src/pages/pdv/Cashier.tsx`
- `src/components/pdv/cashier/PaymentDialog.tsx`
- Possivelmente `src/components/pdv/cashier/ChargeSelectionDialog.tsx`, se o travamento também vier do cancelamento dentro do modal de cobrança.

## Validação

- Testar o caminho: cancelar mesa → ir ao caixa → pressionar F5.
- Confirmar que a tela não fica bloqueada, que nenhum overlay invisível sobra e que o operador consegue continuar usando o caixa.