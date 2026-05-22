## Onde adicionar

Dentro do dropdown **Financeiro** em `src/components/pdv/PDVHeaderNav.tsx`, adicionar um novo item logo abaixo de "CMV Produtos":

```
{ title: "Análise de Produtos", url: "/pdv/relatorios?tab=sales-by-product", icon: BarChart3 }
```

## Suportar deep-link para a aba

Hoje `src/pages/pdv/Reports.tsx` controla a aba ativa só via `useState` local — o link de Financeiro precisa cair direto na seção de Produtos. Ajuste mínimo:

- Ler `?tab=` da URL (via `useSearchParams`) na montagem e usar como valor inicial de `active`.
- Quando o usuário clicar em outra aba na sidebar do hub, atualizar a query string (`setSearchParams({ tab: key })`) para manter o estado refletido na URL.
- Valores aceitos: as chaves já existentes (`overview`, `monthly`, `sales-by-product`, `category`, `user`, `cancellations`, `discounts`, `purchases`). Fallback para `overview` se inválido.

## Resultado

Clicar em **Financeiro → Análise de Produtos** abre `/pdv/relatorios?tab=sales-by-product`, já posicionado na nova página completa de produtos (com todas as 12 sub-abas, filtros e Excel). O acesso original via menu **Relatórios → Produtos** continua funcionando normalmente.

## Arquivos

- `src/components/pdv/PDVHeaderNav.tsx` — 1 linha nova no array Financeiro.
- `src/pages/pdv/Reports.tsx` — sincronização do estado da aba com a query string.
