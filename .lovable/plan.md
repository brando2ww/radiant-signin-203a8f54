## Objetivo

Deixar visualmente claro que cada linha do "Resumo Diário" (aba Mensal do Demonstrativo de Caixa) é clicável e leva ao detalhe do dia.

## Mudança

Em `src/pages/pdv/financial/CashierStatement.tsx`, na tabela do Resumo Diário:

1. Adicionar uma nova coluna no final ("Ações") com um botão `<Button variant="ghost" size="sm">` contendo o texto "Ver detalhes" e um ícone `ChevronRight` (lucide-react) à direita.
2. O botão usa `onClick` com `e.stopPropagation()` e navega para `/pdv/financeiro/demonstrativo-caixa/dia/${day.date}` — a linha inteira continua clicável (já implementado).
3. Manter o `cursor-pointer hover:bg-muted/50` existente para reforçar o affordance.
4. Adicionar `<TableHead className="text-right w-[140px]"></TableHead>` no cabeçalho para alinhar a nova coluna.

Sem mudanças em hooks, lógica ou outras telas.

## Validação

Abrir aba Mensal → cada linha mostra "Ver detalhes ›" alinhado à direita; clicar no botão ou em qualquer parte da linha abre a página do dia.
