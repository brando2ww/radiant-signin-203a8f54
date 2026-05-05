## Cards de produto mais compactos no cardápio do delivery

Trocar o layout vertical (imagem grande no topo) por um layout horizontal compacto — imagem 96–112px à esquerda, info à direita, padrão iFood. Resultado: 2+ produtos visíveis por tela no mobile.

### Arquivo

`src/components/public-menu/ProductCard.tsx`

### Mudanças

- Card vira `flex` horizontal: conteúdo (texto + preço) + thumb 24×24/28×28 (`h-24 w-24 sm:h-28 sm:w-28`).
- Tipografia menor: título `text-sm sm:text-base`, descrição `text-xs line-clamp-2`, preço `text-base`.
- Botão `+` flutua sobre o canto inferior-direito da imagem (h-7 w-7 redondo).
- Badge de desconto vai ao canto da thumb com `text-[10px]`.
- Padding total reduzido para `p-3` e `gap-3`.
- Mantém clique no card → modal de detalhe e a ação rápida do botão `+`.
