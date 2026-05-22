## Problema identificado
A rota `/pdv/caixa` existe e não apresentou erro JavaScript no preview. O replay mostra o layout carregando, mas a área do caixa fica presa nos skeletons enquanto o indicador do caixa alterna entre `Fechado` e `...`. Isso indica que a tela está bloqueada por estado de carregamento/refetch, não por rota inexistente.

## Plano de correção
1. **Ajustar o loading do caixa**
   - Em `use-pdv-cashier`, incluir o carregamento de `useEstablishmentId` no `isLoading` principal.
   - Evitar que a tela fique travada quando não há sessão ativa de caixa; nesse caso, a tela deve renderizar normalmente com `Caixa fechado` e botão `Abrir Caixa`.

2. **Separar loading de sessão e movimentos**
   - Tratar `movements` como carregando somente quando existe `activeSession`.
   - Se o caixa estiver fechado, não esperar movimentos de uma sessão inexistente.

3. **Reduzir refetch visual no cabeçalho**
   - Ajustar `CashierStatus` para não causar percepção de tela “sumindo” durante refetchs curtos.
   - Manter o último estado útil ou mostrar `Fechado` quando não houver sessão, em vez de alternar agressivamente para `...`.

4. **Validar no preview**
   - Abrir `/pdv/caixa` novamente.
   - Confirmar se aparece a tela completa com `Movimentações`, painel de ações, fila do salão e botão `Abrir Caixa` quando não houver sessão ativa.
   - Se a sessão do preview estiver expirada, confirmar apenas o redirecionamento correto para login.