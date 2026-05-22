## Plano

1. **Eliminar loops de renderização na página de Caixa**
   - Ajustar o painel `SalonQueuePanel` para não depender de arrays instáveis em `useEffect`.
   - Usar uma assinatura estável do primeiro pedido de delivery em vez de `delivery.all` inteiro.

2. **Estabilizar callbacks usados no atalho F5 da Frente de Caixa**
   - Evitar que o `useEffect` de teclado em `Cashier.tsx` seja reinstalado desnecessariamente a cada render por causa de funções/sets recriados.
   - Manter o comportamento atual dos atalhos, sem alterar regras de negócio.

3. **Corrigir dependência incompleta no `PaymentDialog`**
   - Incluir `pendingSubtotal` nas dependências do efeito que fecha o pagamento sem itens, evitando estado stale e avisos/fechamentos incorretos.
   - Não mexer novamente no cálculo de desconto já corrigido.

4. **Validar após implementação**
   - Verificar os logs/runtime errors.
   - Abrir `/pdv/caixa` na prévia; se a sessão do navegador cair no login, confirmar que a rota está redirecionando por autenticação e orientar login na prévia.