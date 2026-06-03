## Ajuste: largura do calendário personalizado

**Arquivo:** `src/components/super-admin/dashboard/AdminPeriodFilter.tsx`

**Mudanças:**

1. No `PopoverContent`, trocar `w-auto p-0` por `w-auto p-0 min-w-[680px]` para garantir espaço confortável para os dois meses lado a lado.
2. No `Calendar`, passar `classNames={{ months: "flex flex-col sm:flex-row gap-6" }}` para aumentar o espaçamento entre os dois meses (hoje ficam grudados).
3. Manter `numberOfMonths={2}` e `align="end"`.

Sem mudanças em lógica, dados ou outros componentes.