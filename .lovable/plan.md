## Objetivo
Quando uma seção do menu top tiver apenas 1 item após o filtro de módulos, renderizar como link direto (sem dropdown "Administrador"). Ex.: tenant só com `avaliacoes` verá "Avaliações" direto na navbar.

## Mudanças

**`src/components/pdv/PDVHeaderNav.tsx`**
- Dentro do `.map(filteredSections)`, se `section.items.length === 1`, renderizar um `NavigationMenuItem` com `NavigationMenuLink` apontando direto para `section.items[0].url`, usando o título e ícone do próprio item (não da seção). Manter highlight de ativo.
- Caso contrário, manter o comportamento atual (trigger + content).

Sem alterações em outros arquivos.