Plano para deixar a ordenação simples e previsível:

1. Em `CategorySection.tsx`, trocar a área de produtos de grid 2 colunas para uma lista vertical única (`grid-cols-1`/coluna total), mantendo cada produto ocupando a largura inteira da categoria.

2. Trocar a estratégia do DnD de `rectSortingStrategy` para `verticalListSortingStrategy`, porque agora a interação será exclusivamente subir/descer em uma lista.

3. Em `ProductCard.tsx`, ajustar o card para o formato de linha inteira, preservando imagem, nome, preço, ações e switch, mas com layout estável para desktop e responsivo no mobile.

4. Manter a mutation atual de reordenação com update otimista e invalidação de `delivery-products`, `public-products` e `public-menu`, para refletir no cardápio público após salvar a nova ordem.