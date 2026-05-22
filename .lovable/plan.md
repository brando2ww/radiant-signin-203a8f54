## Diagnóstico
O clique em **Abrir Caixa** está chegando no Supabase e retornando sucesso (`201`). O problema real é que já existem várias sessões de caixa abertas ao mesmo tempo para o mesmo usuário, e a consulta usa `.maybeSingle()` em uma busca que pode retornar múltiplas linhas. Isso deixa o estado do caixa inconsistente: a abertura acontece no banco, mas a UI pode continuar mostrando `Fechado` ou não refletir a sessão corretamente.

## Plano de correção
1. **Buscar somente uma sessão ativa**
   - Em `use-pdv-cashier`, alterar a query de sessão ativa para usar `.limit(1).maybeSingle()` após ordenar por `opened_at desc`.
   - Assim a UI sempre pega a sessão aberta mais recente, mesmo que existam duplicadas antigas.

2. **Impedir nova sessão quando já existe caixa aberto**
   - Antes de inserir uma nova sessão, consultar se já existe sessão aberta para o `visibleUserId`.
   - Se existir, retornar essa sessão em vez de criar outra.
   - Isso evita múltiplos caixas abertos simultaneamente.

3. **Abrir para o estabelecimento correto**
   - Inserir `user_id: visibleUserId` em vez de `user.id`, mantendo a regra do projeto de usar o dono do estabelecimento como fonte dos dados.
   - Manter a trava atual de que apenas o responsável pode abrir o caixa.

4. **Atualizar a UI imediatamente após abrir**
   - No `onSuccess`, preencher o cache de `pdv-cashier-active` com a sessão retornada.
   - Invalidar também status/header e movimentos relacionados para sincronizar todo o PDV.

5. **Melhorar a mensagem de erro**
   - Mostrar o erro real no toast quando a abertura falhar, em vez de apenas `Erro ao abrir caixa`.

6. **Validar**
   - Abrir `/pdv/caixa`, clicar em **Abrir Caixa**, informar um valor e confirmar.
   - Confirmar que o status muda para `Aberto`, o botão muda para ações de caixa aberto e não cria sessões duplicadas.