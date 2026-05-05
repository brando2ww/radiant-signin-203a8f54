## Cobertura por intervalo de CEP

Adicionar uma forma alternativa/complementar de definir a área de cobertura: faixas de CEP (de–até). Qualquer CEP digitado pelo cliente que caia dentro de alguma faixa cadastrada é atendido, com a taxa associada à faixa.

### 1. Modelo de dados (`src/hooks/use-delivery-settings.ts`)

Adicionar novo tipo e campo na interface `DeliverySettings`:

```ts
export interface CepRange {
  id: string;        // uuid local
  label?: string;    // ex.: "Centro 95720-000"
  cep_start: string; // 8 dígitos
  cep_end: string;   // 8 dígitos
  fee: number;
}
```

- Adicionar `cep_ranges: CepRange[]` em `DeliverySettings`.
- Mapear `cep_ranges: (data.cep_ranges as any) || []` no `useDeliverySettings`.
- Persistido em coluna jsonb `cep_ranges` da tabela `delivery_settings` (nova migração).

### 2. Migração Supabase

```sql
ALTER TABLE public.delivery_settings
ADD COLUMN IF NOT EXISTS cep_ranges jsonb NOT NULL DEFAULT '[]'::jsonb;
```

### 3. Novo card no painel de configurações (`DeliverySettings.tsx`)

Inserir um novo card "Cobertura por intervalo de CEP" abaixo do card "Área de Cobertura":

- Lista de faixas existentes: `CEP inicial → CEP final · Taxa · [Lixeira]`.
- Linha de adição: dois `CEPInput` (de / até), `CurrencyInput` (taxa) e botão "+".
- Validação: ambos com 8 dígitos, `cep_start <= cep_end`, sem sobreposição com outra faixa (alerta amigável, não bloqueia).
- Texto auxiliar: "Qualquer CEP do cliente dentro de uma faixa será atendido com a taxa indicada."
- Estado `cepRanges` com `useState<CepRange[]>([])`, salvo em `handleSave` no payload.

### 4. Validação no checkout público (`src/components/public-menu/checkout/DeliveryAddress.tsx` + `AddressForm.tsx`)

Após o CEP ser preenchido (via ViaCEP ou manualmente):

1. Normaliza o CEP (apenas dígitos).
2. Em ordem de prioridade decide cobertura/taxa:
   - **Excluído** (`excluded_ceps`) → bloqueia entrega com mensagem "Não atendemos este CEP".
   - **Faixa de CEP** (`cep_ranges`): se `cep_start <= cep <= cep_end`, libera entrega e usa `fee` da faixa.
   - **Bairro listado** (`delivery_zones`): match por nome do bairro retornado pelo ViaCEP.
   - **Cidade coberta** (`covered_city`) sem match de bairro/faixa → usa `default_delivery_fee` (comportamento atual).
   - Nenhum match → mostra aviso "Endereço fora da área de cobertura" e impede avançar.
3. A taxa resolvida é propagada para `CheckoutFlow` via `onAddressSelected({ ..., deliveryFee })`, substituindo a taxa padrão usada hoje.

### 5. Helper compartilhado

Criar `src/lib/delivery-coverage.ts` com função pura:

```ts
resolveDeliveryCoverage({ cep, neighborhood, city, uf, settings })
  → { covered: boolean; fee: number | null; reason?: 'excluded' | 'range' | 'zone' | 'city' | 'none' }
```

Usada tanto no checkout quanto, futuramente, em outros pontos (admin / simulador).

### 6. Detalhes técnicos

- Comparação de CEP feita como string de 8 dígitos com zero à esquerda — comparação lexicográfica equivale à numérica.
- IDs gerados com `crypto.randomUUID()`.
- Sem mudanças em `use-cep-range-sweep.ts` nem `NeighborhoodSelectorModal` — recurso é independente.
- Tipos do Supabase serão regenerados automaticamente após a migração.

### Arquivos alterados / criados

- `supabase/migrations/<timestamp>_add_cep_ranges.sql` (novo)
- `src/hooks/use-delivery-settings.ts` (tipo + parsing)
- `src/components/delivery/settings/DeliverySettings.tsx` (novo card + state + save)
- `src/lib/delivery-coverage.ts` (novo helper)
- `src/components/public-menu/checkout/DeliveryAddress.tsx` (aplicar helper)
- `src/components/public-menu/checkout/AddressForm.tsx` (aplicar helper ao confirmar)
