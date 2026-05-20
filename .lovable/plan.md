## Novo seletor de período (estilo do print)

Substituir o `DatePickerWithRange` atual por uma versão muito mais rica, mantendo a mesma API (`date` + `setDate`) para que todas as telas que já o usam continuem funcionando sem refactor.

### Layout do popover

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Usados recentemente │      maio 2026          │      junho 2026        │
│  ○ Hoje              │  D S T Q Q S S          │  D S T Q Q S S         │
│  ○ Ontem             │  ··········1 2          │  ··········1 2 3 4 5 6 │
│ ─────────────────    │  3 4 5 6 7 8 9          │  7 8 9 ...             │
│  ○ Hoje              │  10 ... 20●(hoje)       │                        │
│  ○ Ontem             │                          │                       │
│  ○ Hoje e ontem      │                                                  │
│  ○ Últimos 7 dias    │                                                  │
│  ○ Últimos 14 dias   │                                                  │
│  ○ Últimos 28 dias   │                                                  │
│  ● Últimos 30 dias   │                                                  │
│  ○ Esta semana       │                                                  │
│  ○ Semana passada    │                                                  │
│  ○ Este mês          │                                                  │
│  ○ Mês passado       │                                                  │
│  ○ Este ano          │                                                  │
│  ○ Personalizado     │                                                  │
├──────────────────────┴──────────────────────────────────────────────────┤
│  ☑ Comparar  [Período anterior ▾]  [22 de mar de 26] [20 de abr de 26]  │
├─────────────────────────────────────────────────────────────────────────┤
│  Fuso horário das datas: Horário de São Paulo    [Cancelar] [Atualizar] │
└─────────────────────────────────────────────────────────────────────────┘
```

- Trigger mostra `📅 Últimos 30 dias: 21 de abr de 2026 a 20 de mai de 2026` (rótulo do preset + intervalo formatado em pt-BR). Quando custom, só o intervalo.
- Sidebar esquerda: lista de presets clicáveis (radio visual). "Usados recentemente" mostra os 2 últimos presets escolhidos (persistidos em `localStorage`).
- Calendário duplo (já temos `numberOfMonths={2}`), `locale={ptBR}`, com botões `<` / `>` nativos do `react-day-picker`.
- Footer com timezone fixo "Horário de São Paulo" + botões `Cancelar` (descarta) e `Atualizar` (aplica). Seleção é tentativa até clicar em Atualizar.

### Presets (iguais ao print)

`Hoje`, `Ontem`, `Hoje e ontem`, `Últimos 7 dias`, `Últimos 14 dias`, `Últimos 28 dias`, `Últimos 30 dias`, `Esta semana`, `Semana passada`, `Este mês`, `Mês passado`, `Este ano`, `Personalizado`.

Cada preset é uma função `() => DateRange` baseada em `date-fns` (`startOfWeek`, `subDays`, `startOfMonth`, etc., com `locale: ptBR`, semana começando no domingo para bater com o print).

### Comparação

- Novo tipo exportado: `DateRangeWithCompare = { range: DateRange; compare?: { mode: 'previous' | 'previous_year' | 'custom'; range: DateRange } }`.
- O checkbox `Comparar` ativa um `Select` com **Período anterior** / **Mesmo período do ano passado** / **Personalizado**, e dois campos read-only (ou date inputs no modo Personalizado) mostrando o intervalo calculado.
- "Período anterior" = mesmo número de dias imediatamente antes de `range.from`. "Mesmo período do ano passado" = `range` deslocado em 1 ano.

### API e migração

Para não quebrar nenhum dos 10 callers atuais, manter o `DatePickerWithRange` com a mesma assinatura (`date`, `setDate`, `className`) — ele continua devolvendo só o `DateRange` simples. Adicionar **props opcionais**:

```ts
interface DatePickerWithRangeProps {
  date: DateRange | undefined;
  setDate: (date: DateRange | undefined) => void;
  className?: string;
  // novo, opcional:
  compare?: { mode: 'previous' | 'previous_year' | 'custom'; range: DateRange } | null;
  onCompareChange?: (compare: { mode: ...; range: DateRange } | null) => void;
  enableCompare?: boolean; // default true; quem não quer compare passa false
}
```

Telas que **não** passam `compare`/`onCompareChange` simplesmente não enxergam o checkbox marcado por padrão; o resto do popover (presets, calendário duplo, footer, Atualizar) aparece para todas.

### Integração com KPIs do Relatórios do Delivery

1. `ReportsTab.tsx` passa a manter `compare` em estado e envia ao `DatePickerWithRange`.
2. `useDeliveryMetricsComparison` ganha parâmetros `previousFrom`/`previousTo`. Quando `compare` está ativo, usa esse intervalo; quando desativado, retorna sem variação e os cards (`DeliveryMetrics.tsx`) escondem os badges `+/-x% vs período anterior`.
3. `ReportsToolbar.tsx` deixa de mostrar seu próprio botão de período (passa a usar só o novo seletor) — sem duplicação.

### Arquivos

- **Editar** `src/components/ui/date-range-picker.tsx` — reescrita completa (preserva exportação `DatePickerWithRange`).
- **Criar** `src/lib/date-range-presets.ts` — definição dos presets + cálculo de "período anterior" / "mesmo período ano passado".
- **Editar** `src/components/delivery/ReportsTab.tsx` — adicionar estado `compare`, passar ao picker, repassar a hooks.
- **Editar** `src/hooks/use-delivery-metrics-comparison.ts` — aceitar intervalo de comparação customizado.
- **Editar** `src/components/delivery/reports/DeliveryMetrics.tsx` — esconder badge quando `compare` for null.
- **Editar** `src/components/delivery/reports/ReportsToolbar.tsx` — remover bloco de seleção de período próprio (se houver).

### Detalhes técnicos

- `Calendar` usa `pointer-events-auto` (já é o padrão do shadcn aqui).
- Persistir presets recentes em `localStorage` sob `delivery-date-picker:recent` (máx 2).
- Formatação dos rótulos: `format(d, "dd 'de' MMM 'de' yy", { locale: ptBR })` no footer/compare; `format(d, "dd 'de' MMM 'de' yyyy", { locale: ptBR })` no trigger.
- Estado interno do popover é separado do prop (commit só no Atualizar). Cancelar = fecha sem chamar `setDate`/`onCompareChange`.
- Sem cores customizadas: usa `bg-card`, `bg-muted`, `text-foreground`, `border` etc. (regra do projeto).
