Remover os cards de depoimentos exibidos sobre o hero da tela de login (Ana Silva / Bruno Oliveira).

## Mudanças
- `src/pages/Index.tsx`: remover a constante `sampleTestimonials` e passar `testimonials={[]}` (ou omitir a prop) para `AuthLayout`.
- Se `AuthLayout` renderizar a área de depoimentos mesmo com array vazio, ajustar para não renderizar quando vazio.

Sem mudanças de backend, rotas ou estilos globais.