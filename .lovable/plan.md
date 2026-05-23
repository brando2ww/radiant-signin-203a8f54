**Objetivo**
Permitir escolher um intervalo de datas livre (incluindo um único dia) na aba de Relatórios de Desempenho dos entregadores, além dos presets atuais (7/30/90 dias).

**Mudanças**

1. `src/components/delivery/drivers/DriverReports.tsx`
   - Adicionar um botão com `Popover` + `Calendar` (range, locale ptBR) ao lado do select de período, usando o padrão já existente do projeto.
   - Manter os presets "Últimos 7/30/90 dias" e incluir um item "Personalizado".
   - Quando o usuário escolhe um intervalo no calendário, o select muda para "Personalizado" e o hook é chamado com `from`/`to` reais.
   - O botão mostra o intervalo selecionado formatado em pt-BR (ex.: "10/05/2026 – 15/05/2026" ou "12/05/2026").

2. `src/hooks/use-driver-reports.ts`
   - Aceitar `{ from: Date; to: Date }` em vez (ou além) de `days`.
   - Ajustar a query Supabase para usar `gte(created_at, from)` e `lte(created_at, to_end_of_day)`.
   - Gerar `perDay` iterando entre `from` e `to` em vez de `days`.
   - Manter compat: se nenhum intervalo customizado for passado, calcula a partir de `days`.

**Detalhes técnicos**
- Usar `date-fns` com `ptBR` (`format(date, "dd/MM/yyyy", { locale: ptBR })`) — segue o padrão do projeto.
- Componente `Calendar` em modo `range` (já usado em outros relatórios do app).
- Sem mudanças de schema/DB.

**Resultado**
O usuário pode filtrar por um dia específico ou um intervalo arbitrário, mantendo os atalhos rápidos atuais.