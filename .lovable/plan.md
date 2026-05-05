## Problema
No card de cada grupo de composição, o cabeçalho usa um grid de 12 colunas onde Tipo, Obrigatório e o botão de remover ficam comprimidos/sobrepostos (o "Obrigatório" cobre o ícone de lixeira), como mostra a captura.

## Correção
Em `src/components/pdv/ProductCompositionManager.tsx`, no `GroupCard`, trocar o grid de 12 colunas por um layout em duas linhas com `flex-wrap`:

1. **Linha 1**: input "Nome do grupo" (flex-1) + botão de remover (lixeira) à direita.
2. **Linha 2** (`flex flex-wrap gap-3`):
   - Select "Tipo" (largura fixa ~12rem)
   - Inputs "Mín." e "Máx." (largura ~5rem) — só quando tipo = múltipla
   - Switch + label "Obrigatório"

Assim cada controle tem espaço próprio e nada sobrepõe, em qualquer largura de dialog.
