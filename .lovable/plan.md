## Objetivo

Exibir o total de **Vendas a Prazo** dentro do dialog de **Fechamento de Caixa** (não só na impressão), de forma **informativa** — sem conferência cega, porque não há contagem física.

## Mudanças em `src/components/pdv/CloseCashierDialog.tsx`

1. Ler `totalFiado = Number((session as any)?.total_fiado) || 0` junto com os demais totais (linha ~519).

2. **Etapa 1 (apuração às cegas):** quando `totalFiado > 0`, exibir um pequeno card informativo (não um `BlindInput`) abaixo do grid, no estilo:
   > "Vendas a Prazo (fiado): R$ XX,XX — informativo, não entra na conferência."
   Usa ícone `UserCheck` e tokens semânticos (`bg-muted/40 border-dashed`, `text-muted-foreground`).

3. **Etapa 2 (revisão):** mesmo card informativo, posicionado antes do bloco "Total geral / diferença", para o operador ver que aquelas vendas existem mas não contam no fechamento.

4. Nada muda em `buildPayload`, `reviewRows`, totais ou justificativas — fiado **não** é somado em `expectedTotal`/`declaredTotal` e **não** vira `Row`.

## Fora de escopo

- Conferência cega de fiado.
- Mudanças em banco/hook (já implementado: coluna `total_fiado` e movimento no caixa).
