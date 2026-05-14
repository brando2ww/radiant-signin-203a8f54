Plano para corrigir o menu lateral do módulo de Avaliações:

1. Ajustar o contêiner principal do PDV
- O problema ocorre porque o scroll real está em `<main className="flex-1 overflow-auto">`, não na janela.
- Como o `sticky` do menu de Avaliações está tentando se prender ao viewport, ele não acompanha corretamente esse contêiner rolável.

2. Aplicar a correção apenas na rota de Avaliações
- Detectar quando a rota atual estiver em `/pdv/avaliacoes`.
- Nessa rota, trocar o comportamento do `<main>` para um layout com altura fixa abaixo do header: `h-[calc(100vh-3.5rem)] overflow-hidden`.
- Assim, o módulo de Avaliações passa a controlar internamente a rolagem.

3. Ajustar o layout de Avaliações
- Manter o menu lateral com altura `h-[calc(100vh-3.5rem)]` e `overflow-y-auto`.
- Remover a dependência de `sticky`, pois o menu ficará fixo naturalmente dentro do layout de altura travada.
- Fazer apenas a área de conteúdo rolar com `overflow-auto`.

4. Preservar mobile e padrão visual
- Manter o menu mobile horizontal como está.
- Não alterar cores, espaçamentos ou estrutura visual do menu.
- Manter o padrão visual igual ao módulo de Tarefas.

Resultado esperado: ao rolar qualquer tela dentro de `/pdv/avaliacoes`, somente o conteúdo da direita rola; o menu lateral permanece fixo abaixo do header, como na imagem esperada.