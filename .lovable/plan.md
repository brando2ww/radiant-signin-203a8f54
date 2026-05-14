As "linhas aleatórias" no CSV exportado vêm de falta de escape: nomes/comentários com vírgula, aspas ou quebra de linha quebram a estrutura, gerando colunas e linhas extras quando abertos no Excel.

## Correções em `useExportEvaluations` (src/hooks/use-customer-evaluations.ts)

1. **Escape CSV correto**
   - Função `csvEscape(v)` que sempre converte para string, troca aspas duplas internas por `""` e envolve o valor em aspas duplas.
   - Aplicar em todos os campos, inclusive cabeçalho.

2. **Separador e compatibilidade Excel pt-BR**
   - Usar `;` como separador (padrão do Excel em PT-BR; evita conflito com vírgula em valores monetários e nomes).
   - Iniciar arquivo com `sep=;\r\n` para forçar o Excel a respeitar o separador.
   - Prefixar BOM `\ufeff` para acentuação correta.
   - Terminar linhas com `\r\n`.

3. **Tratamento de nulos**
   - Datas/valores ausentes: retornar string vazia em vez de `Invalid Date` ou `null`.
   - `customer_birth_date` pode ser nulo — verificar antes de `new Date(...)`.

4. **Colunas mais úteis**
   - Manter: Data, Nome, WhatsApp, Data Nascimento, NPS, Média Geral.
   - Adicionar: Comentário NPS (`nps_comment`) e Campanha (quando disponível via join), com escape adequado.

5. **Nome do arquivo**
   - Incluir intervalo: `avaliacoes_{startDate}_a_{endDate}.csv` quando filtros existirem.

## Resultado
Sem linhas extras espúrias, acentuação correta no Excel, colunas alinhadas mesmo quando há vírgulas, aspas ou quebras de linha em comentários e nomes.