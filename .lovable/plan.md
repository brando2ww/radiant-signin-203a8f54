## Objetivo

Hoje a aba **Composição** do produto só permite uma lista plana de sub-produtos com quantidade. A aba antiga de **Opções** permitia agrupar itens com:
- Nome do grupo
- Tipo (escolha única / múltipla)
- Obrigatório (sim/não)
- Mín. e máx. de seleções

A composição passará a ter exatamente esses mesmos recursos, organizando os sub-produtos em grupos configuráveis.

## Como ficará a tela

```text
[Switch] Produto Composto

┌── Grupo: "Escolha a proteína" ─────────── [Único] [Obrigatório] [1-1] [✕]
│   • Filé de Frango        qtd 1   R$ 12,00   [✕]
│   • Picanha               qtd 1   R$ 22,00   [✕]
│   [+ Adicionar sub-produto]
└─────────────────────────────────────────────────
┌── Grupo: "Acompanhamentos" ───────────── [Múltiplo] [Opcional] [0-3] [✕]
│   • Arroz                 qtd 1   R$  4,00   [✕]
│   • Batata                qtd 1   R$  6,00   [✕]
│   [+ Adicionar sub-produto]
└─────────────────────────────────────────────────
[+ Novo grupo de composição]

[Resumo] Custo da composição / Margem
[Baixa de estoque: principal | sub-produtos]
```

Cada grupo terá os mesmos controles de Opções: input do nome, switch "Obrigatório", select "Tipo" (Único/Múltiplo), inputs de mín/máx (mín/máx aparecem só quando o tipo é Múltiplo, igual ao padrão do app).

No PDV/Comanda/Garçom/Delivery, ao adicionar um produto composto, será exibido o seletor de grupos exatamente como já acontece hoje com as Opções, validando obrigatoriedade e min/max.

## Mudanças no banco

Migration:

1. Nova tabela `pdv_product_composition_groups`:
   - `id uuid pk`
   - `parent_product_id uuid` (FK `pdv_products`, on delete cascade)
   - `name text not null`
   - `type text not null default 'single'` (single|multiple)
   - `is_required boolean not null default false`
   - `min_selections int not null default 0`
   - `max_selections int not null default 1`
   - `order_position int not null default 0`
   - `created_at timestamptz default now()`
   - RLS espelhando a de `pdv_product_compositions` (acesso via produto pai do owner/staff).

2. Em `pdv_product_compositions`:
   - Adicionar `group_id uuid null` (FK `pdv_product_composition_groups` on delete cascade).
   - Backfill: para cada produto composto existente, criar 1 grupo padrão "Composição" (type=single, is_required=false, min=0, max=1) e migrar todas as composições atuais para esse grupo.
   - Não tornar NOT NULL imediatamente para preservar compat; novas composições sempre criadas via UI já virão com `group_id`.

## Mudanças no código

**Hooks**
- Novo `src/hooks/use-pdv-composition-groups.ts` (CRUD análogo a `use-pdv-product-options`, retornando grupos com `compositions` aninhadas).
- Ajustar `src/hooks/use-pdv-compositions.ts` para aceitar/retornar `group_id` no insert e no select.

**UI**
- Refatorar `src/components/pdv/ProductCompositionManager.tsx` para renderizar lista de grupos (cards), cada um com:
  - Header editável (nome, tipo, obrigatório, mín/máx) usando o mesmo padrão visual de `PDVProductOptionsManager.tsx`.
  - Lista interna de sub-produtos com quantidade e remover.
  - Botão "Adicionar sub-produto" (popover de busca já existente, por grupo).
  - Botão para excluir o grupo inteiro.
- Botão "Novo grupo" no rodapé.
- Manter no rodapé: bloco de totais (custo/margem), select "Baixa de estoque", e o Alert fiscal (sem mudanças).

**Consumo no pedido (PDV / Garçom / Delivery)**
- Onde hoje a composição é expandida automaticamente (`src/utils/expandComposition.ts` e telas de adição de item de produto composto), passar a:
  - Buscar grupos do produto composto.
  - Se houver grupos com itens, abrir o seletor (mesmo componente padrão usado para Opções, adaptado para sub-produtos) validando `is_required`, `min_selections`, `max_selections`.
  - Apenas os sub-produtos selecionados entram no pedido (e na expansão de cozinha/CMV).
  - Compatibilidade: produtos com grupos não-obrigatórios e tipo "single" com 1 item se comportam como hoje (auto-seleção).

**Tipos**
- Atualizar `ProductComposition` para incluir `group_id` e expor `CompositionGroup` com `compositions: ProductComposition[]`.

## Itens fora deste plano
- Não mudaremos o cálculo fiscal (continua do produto principal).
- Não mexeremos no fluxo de Opções (`pdv_product_options`) — composição passa a ter feature paridade, mas continua sendo um conceito separado (sub-produtos reais com estoque próprio).
