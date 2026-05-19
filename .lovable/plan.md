## Auditoria de Exportação/Importação — Módulo Financeiro

### O que foi encontrado

Varri todas as 10 páginas listadas em `src/pages/pdv/financial/`. Apenas **2 seções possuem botão de Exportar/Importar visível hoje**:

| Seção | Botão presente | Estado atual |
|---|---|---|
| Lançamentos (`FinancialTransactions.tsx`) | Nenhum | — |
| Contas a Pagar (`AccountsPayable.tsx`) | Nenhum | — |
| Contas a Receber (`AccountsReceivable.tsx`) | Nenhum | — |
| Fluxo de Caixa (`CashFlow.tsx`) | Nenhum | — |
| Plano de Contas (`ChartOfAccounts.tsx`) | Nenhum | — |
| Centros de Custo (`CostCenters.tsx`) | Nenhum | — |
| **DRE** (`DRE.tsx`) | **"Exportar DRE"** (CSV) | Funcional, com 3 melhorias pequenas |
| CMV Produtos (`ProductCMV.tsx`) | Nenhum | — |
| CMV Geral (`GeneralCMV.tsx`) | Nenhum | — |
| **Demo. Caixa** (`CashierStatement.tsx`) | **"Exportar"** (CSV) | Funcional, com 3 melhorias pequenas |

Conforme sua regra ("nunca deixar botão que não faz nada" — agir apenas quando o botão está visível), as 8 seções sem botão **não exigem ação**. Se quiser que sejam adicionadas exportações nelas, isso vira escopo novo (ver "Fora de escopo" abaixo).

### Diagnóstico das 2 exportações existentes

**DRE → CSV** (`handleExport`, linhas 21–48)
- Gera CSV com dados reais do mês selecionado (`usePDVDre`). ✅
- Disable correto quando `data` é nulo. ✅
- **Problemas pequenos**:
  1. Sem BOM UTF-8 → acentos saem corrompidos no Excel BR.
  2. Anchor não anexada ao DOM → falha silenciosa no Firefox em alguns casos.
  3. `URL.createObjectURL` nunca é revogado → vazamento de memória.
  4. MIME `text/csv` ok, mas como o separador é `;`, idealmente `text/csv;charset=utf-8`.

**Demo. Caixa → CSV** (`handleExport`, linhas 33–66)
- Gera CSV com sessões + KPIs do dia/mês (`usePDVCashierStatement`). ✅
- Disable correto quando `data` é nulo. ✅
- Mesmos 4 problemas pequenos da DRE.

### O que vou alterar

Criar um helper compartilhado `src/lib/csv-export.ts` com `downloadCsv(filename, rows)` que:
- Prepara o conteúdo com **BOM UTF-8** (`\ufeff`),
- Usa MIME `text/csv;charset=utf-8;`,
- Anexa a `<a>` ao DOM, dispara click, remove e chama `URL.revokeObjectURL`.

Trocar `handleExport` em:
- `src/pages/pdv/financial/DRE.tsx`
- `src/pages/pdv/financial/CashierStatement.tsx`

para usar `downloadCsv(...)` — mesma estrutura de linhas, só o final do método muda.

### Validação

- Clicar "Exportar DRE" em um mês com dados → baixa `DRE_YYYY-MM.csv`, abre no Excel/LibreOffice com acentos corretos.
- Clicar "Exportar" em Demo. Caixa (diário e mensal) → baixa CSV com sessões e totais.
- Clicar em ambos quando não há dados → botão desabilitado (já funciona).

### Fora de escopo (precisa sua decisão)

Nenhuma das 8 seções abaixo tem hoje botão de exportar/importar. Posso **adicionar exportação CSV** em todas — mas isso não é "consertar", é nova feature. Confirme se quer que eu inclua na mesma rodada:

- Lançamentos · Contas a Pagar · Contas a Receber · Fluxo de Caixa · Plano de Contas · Centros de Custo · CMV Produtos · CMV Geral

Importação (CSV/XLSX para criar lançamentos, contas, plano de contas etc.) também não existe em nenhuma seção. Como exige modelo de planilha + validação + matching, fica como escopo separado caso queira.