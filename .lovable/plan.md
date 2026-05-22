Vou ajustar o modal de detalhes da comanda para permitir rolagem corretamente quando houver muitos itens ou quando o usuário precisar selecionar/mover itens.

Plano:
1. Alterar o `ComandaDetailsDialog` para ter altura limitada ao viewport e estrutura em coluna com áreas fixas e área central rolável.
2. Fazer a lista de itens usar `min-h-0`/`overflow-y-auto` corretamente, evitando que o rodapé do modal bloqueie o scroll.
3. Manter o total, barra de seleção/mover e botões de ação sempre acessíveis no rodapé do modal.
4. Ajustar o layout para desktop e telas menores sem mudar a lógica de seleção, mover, excluir ou fechar comanda.

Detalhes técnicos:
- Arquivo principal: `src/components/pdv/ComandaDetailsDialog.tsx`.
- O problema provável está no `ScrollArea` dentro de um `DialogContent` flex sem `min-h-0` e com conteúdo inferior fixo competindo pela altura.
- A correção será apenas de layout/rolagem; não vou alterar regra de negócio nem dados.