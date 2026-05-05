## Estender busca/varredura por CEP para Exclusões de Entrega

Hoje a varredura por CEP só existe no modal "Gerenciar bairros" (cobertura). Vamos disponibilizar a mesma capacidade na seção **Exclusões de Entrega**, para o lojista bloquear ruas/CEPs em massa via faixa de CEP da cidade.

### Mudanças

**1. `src/hooks/use-cep-range-sweep.ts`** — enriquecer a varredura
- Em vez de retornar apenas `bairros`, passar a guardar **entries completas**: `{ cep, street, neighborhood }` para cada CEP válido.
- Atualizar `SweepResult` e `onProgress` para incluir tanto `neighborhoods: string[]` (compat) quanto `entries: SweepEntry[]`.
- Cache em `localStorage` salva as entries completas (chave `cep-sweep:{prefix}`); manter compatibilidade lendo formato antigo (array de strings).
- O modal de bairros (cobertura) continua usando só `neighborhoods` — sem quebra.

**2. `src/components/delivery/settings/ExcludedZones.tsx`** — adicionar 3ª aba "Por Faixa de CEP"
- `<Tabs>` passa a ter 3 triggers: `Por CEP` | `Por Rua` | `Por Faixa de CEP` (a última desabilitada se não houver `coveredUF`/`coveredCity`).
- Conteúdo da nova aba:
  - Detecta o prefixo automaticamente via `detectCityCepPrefix(coveredUF, coveredCity)` ao montar a aba (com loading).
  - Input editável do prefixo de 5 dígitos + display "Faixa: 95720-000 até 95720-999".
  - Botão "Varrer" / "Cancelar" (idêntico ao modal de bairros) com `AbortController`.
  - Barra de progresso `done/total` + contagem de CEPs encontrados.
  - Após varredura, lista de checkboxes agrupada por bairro (recolhível) ou lista plana com filtro (busca por bairro/rua/CEP).
  - Botões "Selecionar todos" / "Bloquear selecionados" (adiciona em lote ao `excludedCeps` ignorando duplicatas existentes).
  - Indicador visual em itens já bloqueados (badge cinza, checkbox marcado e disabled).

**3. Modal de bairros (cobertura)** — sem mudança funcional, apenas adapta-se à nova assinatura de `onProgress` (usa `info.neighborhoods`).

### Considerações

- A varredura é cacheada por prefixo, então abrir cobertura e exclusões da mesma cidade reaproveita o resultado (zero requests adicionais).
- Sem mudanças no schema do banco — `excludedCeps` já é um array de `{ cep, street, neighborhood, reason? }`.
- Componente `ExcludedZones` cresce; manter código organizado com um sub-componente interno `<CepRangeSweepPanel>` no próprio arquivo se ficar legível, ou extrair para `src/components/delivery/settings/CepRangeSweepPanel.tsx` se passar de ~120 linhas.

### UX final

Na seção "Exclusões de Entrega" o usuário poderá:
1. Bloquear um CEP individual (já existia)
2. Buscar uma rua pelo nome (já existia)
3. **Novo**: varrer toda a faixa de CEP da cidade, ver lista completa de ruas/CEPs encontrados e bloquear seleções em lote
