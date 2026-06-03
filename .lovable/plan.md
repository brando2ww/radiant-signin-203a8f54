## Problema
Tenant com `avaliacoes` + `tarefas` está caindo no painel standalone `/avaliacoes` (visão mínima só de NPS, sem Tarefas no menu). O standalone só faz sentido quando avaliações é o ÚNICO módulo do tenant.

## Mudança

**`src/hooks/use-user-modules.ts` → `getDefaultModuleRoute`**

Trocar a regra atual:

```ts
if (hasModule('avaliacoes')) return '/avaliacoes';
```

por: redirecionar ao standalone `/avaliacoes` apenas quando avaliações for o único módulo ativo. Caso contrário, usar a rota dentro do app admin (`/pdv/avaliacoes`) para que o menu apareça com todas as seções liberadas (ex.: Administrador com Avaliações + Tarefas).

Nova ordem dentro de `getDefaultModuleRoute`:

```ts
const active = activeModules();
if (active.length === 1 && active[0] === 'avaliacoes') return '/avaliacoes';
if (hasModule('pdv')) return '/pdv/dashboard';
if (hasModule('avaliacoes')) return '/pdv/avaliacoes';
if (hasModule('tarefas')) return '/pdv/tarefas';
if (hasModule('delivery')) return '/pdv/delivery/pedidos';
if (hasModule('financeiro')) return '/pdv/financeiro/lancamentos';
if (hasModule('crm')) return '/pdv/crm';
return '/pdv/dashboard';
```

Sem outras alterações — `PDVHeaderNav` já mostra a seção "Administrador" como dropdown quando há ≥2 itens liberados (Avaliações + Tarefas) e como link direto quando há 1 só, atendendo aos cenários.