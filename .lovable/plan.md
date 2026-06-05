Plano para corrigir a mensagem incorreta de fidelidade:

1. **Padronizar o estado padrão da fidelidade**
   - Hoje a tela administrativa mostra valores padrão com “Programa ativo”, mesmo quando ainda não existe registro salvo em `delivery_loyalty_settings`.
   - A página pública interpreta ausência de registro como `is_active = false`, por isso mostra “Este estabelecimento não possui programa de fidelidade ativo.”
   - Vou ajustar a leitura pública para tratar ausência de configuração como o mesmo padrão da tela administrativa: programa ativo, 1 ponto por R$ 1, mínimo 50 e cashback 0,10.

2. **Evitar regressão na tela administrativa**
   - Manter o formulário atual funcionando normalmente.
   - Ao clicar em “Salvar Configurações”, ele continuará criando/atualizando o registro real no banco.

3. **Validar o fluxo público**
   - Conferir que `/cardapio/kotensushibargaribaldi/meus-pontos` não cai mais na mensagem de programa inativo quando não há registro salvo.
   - Manter a lógica de login, saldo, prêmios e histórico como está.

Detalhe técnico:
- A correção será concentrada no hook `useLoyaltySettings`, para que `PublicMenuHeader`, `PublicMenuLoyalty`, checkout e admin usem a mesma interpretação de configuração padrão.