
## Problema

Hoje existem **dois sistemas de acesso desacoplados** que se atropelam:

1. **`tenant_modules`** (organizacional) — define quais módulos a empresa contratou (`pdv`, `avaliacoes`, `delivery`, `tarefas`, `crm`, `financeiro`). Verificado pelo `ModuleGuard`.
2. **`roleRouteAccess`** em `src/hooks/use-user-role.ts` — allow-list **hardcoded** de rotas por papel (proprietário, gerente, caixa, garçom, etc.). Verificado pelo `RoleRoute`.

Consequências observadas:

- Um `gerente` não tem `/pdv/avaliacoes` nem `/pdv/tarefas` no allow-list → clica no card e é redirecionado.
- Um usuário com `establishment_users.tenant_id` definido cujo tenant não tem `avaliacoes` em `tenant_modules` recebe a tela **"Módulo não disponível"** mesmo quando o papel permite.
- A mensagem "usuário não tem acesso ao PDV" também ocorre porque o `ModuleGuard module="pdv"` envolve **toda** a `/pdv/*`: se o tenant não tem `pdv` ativo, qualquer card explode.
- Há tenants com módulos parciais (11 `avaliacoes`, 9 `pdv`, etc.) e 14 dos 25 staff users têm `tenant_id` preenchido, então o problema atinge contas reais.

A regra que o cliente pediu: **"liberou o módulo X → libera tudo que pertence a X"**. O papel deve refinar *dentro* do módulo, não esconder páginas que o módulo já liberou.

## O que vou fazer

### 1. Mapear rotas → módulo (fonte única da verdade)

Criar `src/lib/access/module-routes.ts` com um mapa estático:

```text
pdv         → /pdv/dashboard, /pdv/salao, /pdv/caixa, /pdv/comandas,
              /pdv/produtos, /pdv/centros-producao, /pdv/estoque,
              /pdv/fornecedores, /pdv/notas-fiscais, /pdv/cupons-fiscais,
              /pdv/relatorios, /pdv/configuracoes, /pdv/usuarios,
              /pdv/integracoes, /pdv/franquia, /pdv/clientes,
              /pdv/venda-a-prazo, /pdv/compras/*, /garcom
financeiro  → /pdv/financeiro/*
delivery    → /pdv/delivery/*
avaliacoes  → /pdv/avaliacoes, /avaliacoes
tarefas     → /pdv/tarefas
crm         → (reservado)
```

### 2. Reescrever `useUserRole.canAccess` para combinar módulo + papel

- A rota é permitida quando **(módulo do tenant está ativo) E (papel tem permissão estrutural)**.
- "Permissão estrutural" do papel passa a ser **inclusiva por módulo**: se `gerente` tem o módulo, vê todas as rotas daquele módulo. Papéis restritos (`caixa`, `garcom`, `cozinheiro`, `estoquista`, `financeiro`, `atendente_delivery`) mantêm sub-allow-list mas a lista é construída a partir do mapa de módulos, sem nomes de rota soltos.
- Adicionar `/pdv/avaliacoes` e `/pdv/tarefas` ao escopo de `gerente`.

### 3. Corrigir `useUserModules` para staff

- Quando `establishment_users.tenant_id` é nulo, resolver o tenant pelo **dono** do estabelecimento (`establishment_owner_id` → `tenants.owner_user_id`) antes de cair no fallback "libera tudo".
- Manter o fallback "sem tenant = libera tudo" só para contas legadas sem nenhum vínculo.

### 4. Remover `ModuleGuard` redundante por rota

- Manter `ModuleGuard module="pdv"` no shell `/pdv/*` (única checagem de módulo nesse nível).
- Remover os `ModuleGuard module="tarefas"` aninhados em `PDV.tsx` (a checagem fica em `canAccess`, que agora consulta `hasModule`).
- `EvaluationsPanel.tsx` (`/avaliacoes/*`) mantém `ModuleGuard module="avaliacoes"`.

### 5. Fluxo público de avaliação — varredura

Como você marcou também "Fluxo público de avaliação", vou abrir uma segunda passada nos arquivos:

- `src/hooks/use-public-evaluation.ts` (submissão, NPS opcional, perguntas ativas)
- `src/components/public-evaluation/SpinWheel.tsx` e `PrizeResult.tsx` (roleta e prêmio)
- Páginas públicas que consomem esses hooks

Foco em: RLS (a tabela `customer_evaluations` precisa permitir `INSERT` anônimo), validação de WhatsApp/aniversário, e o erro `refresh_token_not_found` que aparece no console em rotas públicas (sessão fantasma do Supabase).

Eventuais bugs encontrados aqui serão corrigidos no mesmo lote; se aparecer algo grande que mude o escopo, eu paro e te aviso antes.

### 6. Validação manual

- Logar como `gerente` com tenant que tem `avaliacoes` e `tarefas` → cards abrem.
- Logar como `caixa` → continua só com `/pdv/caixa` (papel restringe dentro do módulo).
- Logar como staff sem `tenant_id` direto → resolve via owner e respeita módulos do tenant.
- Tenant sem `pdv` no `tenant_modules` → bloqueio único e claro no shell, sem cascata de erros nos cards.

## Detalhes técnicos

- Não mexer em `src/integrations/supabase/types.ts`.
- Sem migração de schema nesta etapa — só código. Se a varredura do fluxo público revelar policy/`GRANT` faltando em `customer_evaluations` / `evaluation_answers`, abro migração específica com aprovação.
- Manter a memória do projeto: tokens semânticos, sem cores customizadas, sem alterar a estrutura de header `h-14`.
